import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

let client: MongoClient;
let db: Db;

export async function connectToDatabase(): Promise<Db> {
    try {
        if (db) {
            return db; // Return existing connection
        }

        client = new MongoClient(uri!);
        await client.connect();
        db = client.db(dbName);

        console.log(`✅ Connected to MongoDB: ${dbName}`);
        return db;
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1); // Exit if connection fails
    }
}

/**
 * Close MongoDB connection
 */
export async function closeDatabase(): Promise<void> {
    if (client) {
        await client.close();
        console.log("🔌 MongoDB connection closed.");
    }
}