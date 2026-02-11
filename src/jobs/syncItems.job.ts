import { scrape } from "../services/wikiIngestService";
import { mapRawItemToBaroItem } from "../utils/mapItem";
import { syncItems } from "../services/syncService";

export async function syncItemsJob() {
    console.log("Starting wiki sync process...");
    const data = await scrape();
    const rawItems = data.Items;
    if (!rawItems) throw new Error("No Items found in scraped data");

    const rawItemsArray = Object.values(rawItems);
    console.log(`Found ${rawItemsArray.length} items from wiki`);
    const wikiItems = rawItemsArray.map(itemData => mapRawItemToBaroItem(itemData));
    return syncItems(wikiItems);
}
