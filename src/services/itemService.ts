import { collections, connectToDatabase } from "../db/database.service";
import Item from "../models/Item";

/**
 * Fetches all items from the database
 * @returns Array of all Item objects
 */
export async function fetchAllItems(): Promise<Item[]> {
    await connectToDatabase();

    if (!collections.items) {
        throw new Error("Database collection not initialized");
    }

    const items = await collections.items.find({}).toArray();
    return items as unknown as Item[];
}
