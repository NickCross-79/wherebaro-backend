import { MongoClient, Db } from "mongodb";
import { collections, connectToDatabase } from "../db/database.service.js";
import BaroItem from "../models/baroItem.js";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

let client: MongoClient;
let db: Db;

/**
 * Inserts multiple BaroItems into the database
 * @param items Array of BaroItems to insert
 * @returns The inserted items with their generated _ids
 */
export async function insertBaroItems(items: BaroItem[]): Promise<BaroItem[]> {
    await connectToDatabase();
    
    if (!collections.baroItems) {
        throw new Error("Database collection not initialized");
    }

    const result = await collections.baroItems.insertMany(items);
    
    console.log(`✅ Inserted ${items.length} items into the database`);
    return items;
}
