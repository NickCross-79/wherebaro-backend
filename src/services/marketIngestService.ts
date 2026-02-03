import { collections } from "../db/database.service";
import * as mongoDB from "mongodb";
import Market from "../models/Market";

interface MarketDataPoint {
  datetime: string;
  volume: number;
  avg_price: number;
  mod_rank?: number;
  subtype?: string;
}

interface WarframeMarketResponse {
  payload: {
    statistics_closed: {
      "90days": Array<{
        datetime: string;
        volume: number;
        avg_price: number;
        mod_rank?: number;
        [key: string]: any;
      }>;
    };
  };
}

export async function fetchMarketData(): Promise<void> {
  if (!collections.items || !collections.markets) {
    throw new Error("Items or Markets collection not initialized");
  }

  try {
    // Get all items that are Mod, Weapon, or Void Relic
    const items = await collections.items
      .find({
        type: {
          $in: [/^mod/i, /^weapon/i, /^void relic/i]
        }
      })
      .toArray();

    console.log(`Found ${items.length} items to fetch market data for`);

    const marketsCollection = collections.markets;

    for (const item of items) {
      try {
        // Convert item name to API slug format (with overrides)
        const slug = applySlugOverrides(itemNameToSlug(item.name));

        if (!slug) {
          console.log(`Skipping market data fetch for ${item.name}`);
          continue;
        }
        
        const response = await fetch(
          `https://api.warframe.market/v1/items/${slug}/statistics`
        );

        if (!response.ok) {
          console.warn(`Failed to fetch market data for ${item.name} (${slug}): ${response.status}`);
          continue;
        }

        const marketData: WarframeMarketResponse = await response.json();
        
        const ninetyDaysData = marketData.payload.statistics_closed["90days"];
        
        if (!ninetyDaysData || ninetyDaysData.length === 0) {
          console.warn(`No 90-day data available for ${item.name}`);
          continue;
        }

        // Transform the data to only include fields we care about
        const transformedData: MarketDataPoint[] = ninetyDaysData.map(dataPoint => ({
          datetime: dataPoint.datetime,
          volume: dataPoint.volume,
          avg_price: dataPoint.avg_price,
          ...(dataPoint.mod_rank !== undefined && { mod_rank: dataPoint.mod_rank }),
          ...(item.subtype && { subtype: item.subtype })
        }));

        // Upsert market data
        const marketItem = new Market(
          item._id,
          transformedData,
          new Date()
        );

        await marketsCollection.updateOne(
          { item_oid: item._id },
          { $set: marketItem },
          { upsert: true }
        );

        console.log(`Updated market data for ${item.name}`);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching market data for item ${item.name}:`, error);
      }
    }

    console.log("Market data ingestion completed");
  } catch (error) {
    console.error("Error in fetchMarketData:", error);
    throw error;
  }
}

function itemNameToSlug(itemName: string): string {
  return itemName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function applySlugOverrides(slug: string): string | null {
  if (slug === "ignis_wraith") {
    return null;
  }

  const overrides: Record<string, string> = {
    primed_bane_of_orokin: "primed_bane_of_corrupted",
    primed_cleanse_orokin: "primed_cleanse_corrupted",
    primed_smite_orokin: "primed_smite_corrupted",
    primed_expel_orokin: "primed_expel_corrupted",
    "primed_rubedo-lined_barrel": "primed_rubedo_lined_barrel"
  };

  return overrides[slug] ?? slug;
}
