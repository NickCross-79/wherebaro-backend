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
import { fetchBaroData, isBaroActive } from "../services/baroApiService";
import { resolveBaroInventory } from "../services/itemService";
import { upsertCurrent } from "../services/currentService";
import { sendBaroArrivalNotification, sendWishlistMatchNotification } from "../services/notificationService";
import { getWishlistMatchesForCurrentInventory } from "../services/wishlistService";

export async function baroArrivalJob() {
    console.log("[Baro Arrival] Starting Friday arrival flow...");

    const baroData = await fetchBaroData();
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

    // Send arrival notification to all users
    await sendBaroArrivalNotification(baroData.location);

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
