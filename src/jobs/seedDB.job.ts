import { scrapeAndPrepareBaroItems } from "../services/wikiIngestService";
import { insertBaroItems } from "../services/seedDBService";
import { backfillItemData } from "../services/itemService";

export async function seedDB() {
    console.log("Starting DB seeding process...");

    const baroItems = await scrapeAndPrepareBaroItems();
    await insertBaroItems(baroItems);

    console.log("Seeding complete, backfilling item data...");
    const backfillResult = await backfillItemData();

    console.log("Database seeding complete!");
    return backfillResult;
}
