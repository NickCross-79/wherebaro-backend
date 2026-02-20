import { scrapeAndPrepareBaroItems } from "../services/wikiIngestService";
import { insertBaroItems } from "../services/seedDBService";
import { backfillUniqueNames } from "../services/itemService";

export async function seedDB() {
    console.log("Starting DB seeding process...");

    const baroItems = await scrapeAndPrepareBaroItems();
    await insertBaroItems(baroItems);

    console.log("Seeding complete, backfilling unique names...");
    const backfillResult = await backfillUniqueNames();

    console.log("Database seeding complete!");
    return backfillResult;
}
