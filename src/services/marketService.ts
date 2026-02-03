import { collections, connectToDatabase } from "../db/database.service.js";
import { ObjectId } from "mongodb";
import Market from "../models/Market.js";

/**
 * Fetches market data for a specific item
 * @param itemId The MongoDB ObjectId of the item
 * @returns Market data record or null if none exists
 */
export async function getMarketDataForItem(itemId: ObjectId): Promise<Market | null> {
  await connectToDatabase();

  if (!collections.markets) {
    throw new Error("Markets collection not initialized");
  }

  const market = await collections.markets.findOne({ item_oid: itemId });
  return market as Market | null;
}