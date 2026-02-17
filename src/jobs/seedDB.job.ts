import { scrape } from "../services/wikiIngestService";
import { mapRawItemToBaroItem } from "../utils/mapItem";
import { insertBaroItems } from "../services/seedDBService";
import { isWikiExcludedItem } from "../utils/itemMappings";

export async function seedDB() {
    console.log("Starting DB seeding process...");

    const data = await scrape();
    
    // Extract the Items object
    const rawItems = data.Items;
    
    if (!rawItems) {
        throw new Error("No Items found in scraped data");
    }

    // Convert object to array of raw item data
    const rawItemsArray = Object.values(rawItems);
    console.log(`Found ${rawItemsArray.length} items`);
    
    // Map each raw item to BaroItem
    const wikiItems = rawItemsArray.map(itemData => mapRawItemToBaroItem(itemData));
    
    // Filter out excluded items
    const baroItems = wikiItems.filter(item => !isWikiExcludedItem(item.name));
    const excludedCount = wikiItems.length - baroItems.length;
    if (excludedCount > 0) {
        console.log(`Excluded ${excludedCount} item(s) from seeding`);
    }
    
    // Batch insert into database
    await insertBaroItems(baroItems);
    console.log("Database seeding complete!");
}

//get data from wiki
//clean/bundle data
//insert into mongodb

//get data from wiki
//clean/bundle data
//insert into mongodb