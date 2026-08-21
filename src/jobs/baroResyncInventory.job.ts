/**
 * Job: Baro Resync Inventory (operational, no notifications)
 *
 * Re-resolves Baro's live manifest against the database and rewrites the
 * `current` document — nothing else. Use it when the inventory stored for an
 * in-progress visit is incomplete but users have already been told Baro is
 * here: after updating @wfcd/items so a previously unresolvable item can be
 * created, after adding a manual uniqueName mapping, or after any item-data fix
 * applied mid-visit.
 *
 * This deliberately imports nothing from the notification layer. Re-running the
 * arrival job would work too, but it announces Baro's arrival a second time to
 * everyone; the point of this job is that it structurally cannot.
 *
 * Safe to run repeatedly. It leaves the arrival-notification stamp untouched,
 * so it neither suppresses nor triggers any notification.
 */
import { fetchBaroData, isBaroActive } from "../services/baroApiService";
import { resolveBaroInventory } from "../services/itemService";
import { fetchCurrent, upsertCurrent } from "../services/currentService";

export async function baroResyncInventoryJob() {
    console.log("[Baro Resync] Re-resolving Baro's inventory (no notifications will be sent)...");

    const baroData = await fetchBaroData();

    if (!isBaroActive(baroData.activation, baroData.expiry)) {
        console.log(`[Baro Resync] Baro is not active — nothing to resync. Next arrival: ${baroData.activation}`);
        return { updated: false, notificationsSent: false, reason: "baro-not-active" };
    }

    // Never overwrite a stored manifest with an empty one just because the
    // upstream has not published yet.
    if (baroData.inventory.length === 0) {
        console.warn("[Baro Resync] Upstream reports Baro active but returned no inventory — leaving the document untouched");
        return { updated: false, notificationsSent: false, reason: "upstream-empty-inventory" };
    }

    const before = await fetchCurrent();
    const itemsBefore = before.items?.length ?? 0;

    const { inventoryIds, unmatchedItems, ignoredItems } = await resolveBaroInventory(baroData.inventory);

    await upsertCurrent(true, baroData.activation, baroData.expiry, baroData.location, inventoryIds);

    console.log(
        `[Baro Resync] Updated current — ${itemsBefore} → ${inventoryIds.length} items ` +
        `(${baroData.inventory.length} from API, source: ${baroData.source})`
    );
    if (unmatchedItems.length > 0) {
        console.warn(`[Baro Resync] Still unresolved: ${unmatchedItems.join(", ")}`);
    }

    return {
        updated: true,
        notificationsSent: false,
        itemsBefore,
        itemsAfter: inventoryIds.length,
        totalApiItems: baroData.inventory.length,
        unmatchedItems,
        ignoredItems,
        source: baroData.source,
    };
}
