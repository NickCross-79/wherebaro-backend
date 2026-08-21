/**
 * Job: Baro Reconcile (safety net)
 *
 * Runs hourly across the visit window and repairs the `current` document if it
 * disagrees with reality. It exists because the Friday arrival job gets exactly
 * one chance: if it bails out — upstream lag, a transient API failure, a bad
 * deploy — nothing else ever revisits the decision, so a missed arrival stays
 * missed for the whole visit and no notification is ever sent.
 *
 * Flow:
 *   1. Fetch Baro data (world state cross-check included).
 *   2. If Baro is not active, do nothing — departure owns that transition.
 *   3. If Baro IS active but the stored document says otherwise, or has no
 *      inventory, resolve the manifest and rewrite the document.
 *   4. Send the arrival notification only if this cycle never got one.
 *
 * Safe to run repeatedly: a healthy document is left untouched, and the
 * arrivalNotifiedFor stamp makes the notification exactly-once per cycle.
 */
import { fetchBaroData, isBaroActive } from "../services/baroApiService";

/**
 * Compares two cycle timestamps by instant rather than by string.
 *
 * The same activation reaches us serialized differently depending on the
 * source — the world state is rebuilt through toISOString() and always carries
 * milliseconds, the primary API serializes its own way. Comparing the raw
 * strings would read a formatting difference as a different cycle, and on this
 * job that means "repair and notify" — a duplicate arrival push to every user.
 */
function isSameCycle(a?: string, b?: string): boolean {
    if (!a || !b) return false;
    const left = new Date(a).getTime();
    const right = new Date(b).getTime();
    return Number.isFinite(left) && left === right;
}
import { resolveBaroInventory } from "../services/itemService";
import { fetchCurrent, upsertCurrent, markArrivalNotified } from "../services/currentService";
import { sendBaroArrivalNotification, sendWishlistMatchNotification } from "../services/notificationService";
import { getWishlistMatchesForCurrentInventory } from "../services/wishlistService";

export async function baroReconcileJob() {
    const baroData = await fetchBaroData();
    const isHere = isBaroActive(baroData.activation, baroData.expiry);

    if (!isHere) {
        return { repaired: false, notificationSent: false, reason: "baro-not-active" };
    }

    const current = await fetchCurrent();
    const storedIsActive = current.isActive === true;
    const storedHasItems = (current.items?.length ?? 0) > 0;
    const storedCycleMatches = isSameCycle(current.activation, baroData.activation);

    // Healthy: the document already describes this cycle, is marked active and
    // carries a manifest. Nothing to do.
    if (storedIsActive && storedHasItems && storedCycleMatches) {
        return { repaired: false, notificationSent: false, reason: "already-consistent" };
    }

    const reason = !storedCycleMatches
        ? "stale-cycle-stored"
        : !storedIsActive
            ? "stored-inactive-while-baro-here"
            : "stored-empty-inventory";

    console.warn(
        `[Baro Reconcile] Repairing current document (${reason}) — ` +
        `stored: isActive=${current.isActive}, items=${current.items?.length ?? 0}, activation=${current.activation}; ` +
        `upstream: activation=${baroData.activation}, ${baroData.inventory.length} items (source: ${baroData.source})`
    );

    // Resolve the manifest before overwriting anything. If the upstream is
    // still empty there is nothing worth writing — leaving the document alone
    // keeps the next run's comparison meaningful rather than stamping an empty
    // inventory over it.
    if (baroData.inventory.length === 0) {
        console.warn("[Baro Reconcile] Upstream reports Baro active but has no inventory — leaving document untouched until it publishes");
        return { repaired: false, notificationSent: false, reason: "upstream-empty-inventory" };
    }

    const { inventoryIds, unmatchedItems } = await resolveBaroInventory(baroData.inventory);
    await upsertCurrent(true, baroData.activation, baroData.expiry, baroData.location, inventoryIds);
    console.log(`[Baro Reconcile] Repaired current — ${inventoryIds.length} items`);

    // Notify only if this cycle never got an arrival notification.
    //
    // The stamp is the direct evidence, but a document already marked active for
    // this same cycle is evidence too: something announced this arrival before we
    // got here — the arrival job, or a manual run predating the stamp. Repairing
    // an inventory is not a reason to announce Baro twice.
    const alreadyNotified =
        isSameCycle(current.arrivalNotifiedFor, baroData.activation) ||
        (storedIsActive && storedCycleMatches);
    let notificationSent = false;
    let wishlistSent = 0;

    if (alreadyNotified) {
        console.log("[Baro Reconcile] Arrival notification already sent for this cycle — skipping");
    } else {
        await sendBaroArrivalNotification(baroData.location);
        await markArrivalNotified(baroData.activation);
        notificationSent = true;
        console.log("[Baro Reconcile] Sent the arrival notification this cycle never got");

        try {
            const wishlistMatches = await getWishlistMatchesForCurrentInventory();
            for (const [token, itemNames] of wishlistMatches) {
                const result = await sendWishlistMatchNotification(token, itemNames);
                if (result.success) wishlistSent++;
            }
            if (wishlistSent > 0) {
                console.log(`[Baro Reconcile] Sent ${wishlistSent} wishlist notification(s)`);
            }
        } catch (wishlistError) {
            console.error("[Baro Reconcile] Error sending wishlist notifications:", wishlistError);
        }
    }

    return {
        repaired: true,
        notificationSent,
        reason,
        inventoryCount: inventoryIds.length,
        unmatchedItems,
        wishlistSent,
        source: baroData.source,
    };
}
