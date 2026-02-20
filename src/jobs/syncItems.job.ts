import { scrapeAndPrepareBaroItems } from "../services/wikiIngestService";
import { syncItems } from "../services/syncService";

export async function syncItemsJob() {
    console.log("Starting wiki sync process...");

    const baroItems = await scrapeAndPrepareBaroItems();

    return syncItems(baroItems);
}
