import { scrape } from "../services/wikiIngestService";
import { mapRawItemToBaroItem } from "../utils/mapItem";
import { insertBaroItems } from "../services/seedDBService";

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
    const baroItems = rawItemsArray.map(itemData => mapRawItemToBaroItem(itemData));
    
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