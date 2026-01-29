import { collections, connectToDatabase } from "../db/database.service.js";
import BaroItem from "../models/baroItem.js";

export async function fetchAllBaroItems(): Promise<BaroItem[]> {
    await connectToDatabase();

    if (!collections.baroItems) {
        throw new Error("Database collection not initialized");
    }

    const items = await collections.baroItems.find({}).toArray();
    return items as unknown as BaroItem[];
}
