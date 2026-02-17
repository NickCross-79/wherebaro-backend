import { scrape } from "../services/wikiIngestService";
import { mapRawItemToBaroItem } from "../utils/mapItem";
import { syncItems } from "../services/syncService";
import { WIKI_EXCLUDED_ITEMS, isWikiExcludedItem } from "../utils/itemMappings";

export async function syncItemsJob() {
    console.log("Starting wiki sync process...");
    const data = await scrape();
    const rawItems = data.Items;
    if (!rawItems) throw new Error("No Items found in scraped data");

    const rawItemsArray = Object.values(rawItems);
    console.log(`Found ${rawItemsArray.length} items from wiki`);
    const wikiItems = rawItemsArray.map(itemData => mapRawItemToBaroItem(itemData));
    
    // Filter out excluded items
    const filteredItems = wikiItems.filter(item => !isWikiExcludedItem(item.name));
    const excludedCount = wikiItems.length - filteredItems.length;
    if (excludedCount > 0) {
        console.log(`Excluded ${excludedCount} item(s) from sync`);
    }
    
    return syncItems(filteredItems);
}
