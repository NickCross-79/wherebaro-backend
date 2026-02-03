import { getMarketDataForItem } from "../services/marketService.js";
import { ObjectId } from "mongodb";
import Market from "../models/Market.js";

export async function getMarketDataJob(itemId: string): Promise<Market | null> {
  const objectId = new ObjectId(itemId);
  const marketData = await getMarketDataForItem(objectId);
  return marketData;
}