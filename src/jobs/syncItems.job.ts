import { scrapeAndPrepareBaroItems } from "../services/wikiIngestService";
import { syncItems } from "../services/syncService";
import { backfillItemData } from "../services/itemService";

export async function syncItemsJob() {
    console.log("Starting wiki sync process...");

    const baroItems = await scrapeAndPrepareBaroItems();

    const syncResult = await syncItems(baroItems);
    await backfillItemData();

    return syncResult;
}
