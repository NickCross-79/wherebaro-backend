import { scrapeAndPrepareBaroItems } from "../services/wikiIngestService";
import { insertBaroItems } from "../services/seedDBService";

export async function seedDB() {
    console.log("Starting DB seeding process...");

    const baroItems = await scrapeAndPrepareBaroItems();

    await insertBaroItems(baroItems);
    console.log("Database seeding complete!");
}
