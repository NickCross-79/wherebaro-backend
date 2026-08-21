/**
 * Job: Baro Arrival (Friday)
 *
 * Single orchestrator for the entire Friday Baro arrival flow:
 *   1. Fetch Baro data (with API health check and world state fallback)
 *   2. Check if Baro is currently active
 *   3. Resolve inventory items against the DB
 *   4. Upsert the `current` document
 *   5. Send arrival + wishlist notifications
 *
 * Services remain single-responsibility — this job handles the workflow.
 */
import { fetchBaroData, isBaroActive, isStaleCycle, BaroApiResponse } from "../services/baroApiService";
import { resolveBaroInventory } from "../services/itemService";
import { upsertCurrent, markArrivalNotified } from "../services/currentService";
import { sendBaroArrivalNotification, sendWishlistMatchNotification } from "../services/notificationService";
import { getWishlistMatchesForCurrentInventory } from "../services/wishlistService";

const INVENTORY_RETRY_ATTEMPTS = 30;
const INVENTORY_RETRY_DELAY_MS = 10_000; // 10 seconds between retries

/**
 * Decides whether a response is worth retrying, and why.
 * Returns null once the data is good enough to act on.
 *
 * Two distinct kinds of upstream lag show up when this job runs at Baro's
 * arrival time:
 *   - "stale-cycle"    — every source still reports the *previous* visit, so
 *                        Baro reads as absent when he has in fact just landed.
 *   - "empty-inventory"— Baro reads as active but his manifest is not published
 *                        yet.
 *
 * A genuine off-week absence looks different from both: the next cycle is
 * already published, so activation is in the future and expiry has not passed.
 * That is the truth and returns null immediately — Baro is biweekly, so most
 * Fridays this job legitimately finds nobody home.
 */
function getRetryReason(data: BaroApiResponse): "stale-cycle" | "empty-inventory" | null {
    if (isStaleCycle(data.expiry)) return "stale-cycle";
    if (isBaroActive(data.activation, data.expiry) && data.inventory.length === 0) return "empty-inventory";
    return null;
}

/**
 * Attempts to fetch Baro data that is actually usable, retrying while every
 * source is still lagging behind the arrival.
 *
 * Previously this returned immediately whenever Baro read as absent, which
 * meant the one case that actually happens at the activation timestamp — the
 * API still serving last visit's cycle — got zero retries and silently skipped
 * the whole arrival.
 */
async function fetchBaroDataWithInventoryRetry(): Promise<BaroApiResponse> {
    for (let attempt = 1; attempt <= INVENTORY_RETRY_ATTEMPTS; attempt++) {
        const data = await fetchBaroData();
        const reason = getRetryReason(data);

        if (!reason) {
            if (attempt > 1) {
                console.log(`[Baro Arrival] Got usable data on attempt ${attempt}`);
            }
            return data;
        }

        if (attempt < INVENTORY_RETRY_ATTEMPTS) {
            console.warn(
                `[Baro Arrival] Upstream still lagging (${reason}) ` +
                `(attempt ${attempt}/${INVENTORY_RETRY_ATTEMPTS}). ` +
                `Retrying in ${INVENTORY_RETRY_DELAY_MS / 1000}s...`
            );
            await new Promise((resolve) => setTimeout(resolve, INVENTORY_RETRY_DELAY_MS));
        }
    }

    console.warn(`[Baro Arrival] Upstream still lagging after ${INVENTORY_RETRY_ATTEMPTS} attempts — proceeding with whatever the API returns`);
    return fetchBaroData();
}

export async function baroArrivalJob() {
    console.log("[Baro Arrival] Starting Friday arrival flow...");

    const baroData = await fetchBaroDataWithInventoryRetry();
    const isHere = isBaroActive(baroData.activation, baroData.expiry);

    // Baro is absent — store inactive status, no notifications
    if (!isHere) {
        await upsertCurrent(false, baroData.activation, baroData.expiry, baroData.location);
        console.log(`[Baro Arrival] Baro is not active. Next arrival: ${baroData.activation}`);
        return { updated: true, isActive: false, notificationSent: false };
    }

    // Baro is active — resolve inventory
    let inventoryIds: import("mongodb").ObjectId[] = [];
    let unmatchedItems: string[] = [];

    if (baroData.inventory.length > 0) {
        const resolved = await resolveBaroInventory(baroData.inventory);
        inventoryIds = resolved.inventoryIds;
        unmatchedItems = resolved.unmatchedItems;
    } else {
        console.warn("[Baro Arrival] Baro is active but API returned no inventory");
    }

    // Upsert current document
    await upsertCurrent(true, baroData.activation, baroData.expiry, baroData.location, inventoryIds);
    console.log(`[Baro Arrival] Updated DB — ${inventoryIds.length} items (source: ${baroData.source})`);

    // Send arrival notification to all users, then record the cycle so the
    // reconcile job can repair this document later without re-notifying.
    await sendBaroArrivalNotification(baroData.location);
    await markArrivalNotified(baroData.activation);

    // Send targeted wishlist notifications
    let wishlistSent = 0;
    try {
        const wishlistMatches = await getWishlistMatchesForCurrentInventory();
        for (const [token, itemNames] of wishlistMatches) {
            const result = await sendWishlistMatchNotification(token, itemNames);
            if (result.success) wishlistSent++;
        }
        if (wishlistSent > 0) {
            console.log(`[Baro Arrival] Sent ${wishlistSent} wishlist notification(s)`);
        }
    } catch (wishlistError) {
        console.error("[Baro Arrival] Error sending wishlist notifications:", wishlistError);
    }

    return {
        updated: true,
        isActive: true,
        notificationSent: true,
        inventoryCount: inventoryIds.length,
        totalApiItems: baroData.inventory.length,
        unmatchedItems,
        wishlistSent,
        source: baroData.source,
    };
}
