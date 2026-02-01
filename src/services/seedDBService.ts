import { collections, connectToDatabase } from "../db/database.service.js";
import Item from "../models/Item.js";

/**
 * Inserts multiple Items into the database
 * @param items Array of Items to insert
 * @returns The inserted items with their generated _ids
 */
export async function insertBaroItems(items: Item[]): Promise<Item[]> {
    await connectToDatabase();
    
    if (!collections.items) {
        throw new Error("Database collection not initialized");
    }

    await collections.items.insertMany(items);
    
    console.log(`✅ Inserted ${items.length} items into the database`);
    return items;
}
