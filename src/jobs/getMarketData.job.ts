import { getMarketDataForItem } from "../services/marketService";
import { ObjectId } from "mongodb";
import Market from "../models/Market";

export async function getMarketDataJob(itemId: string): Promise<Market | null> {
  const objectId = new ObjectId(itemId);
  const marketData = await getMarketDataForItem(objectId);
  return marketData;
}