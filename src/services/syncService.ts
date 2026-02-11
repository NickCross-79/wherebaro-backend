import { collections, connectToDatabase } from "../db/database.service";
import Item from "../models/Item";

/** Fields that should be updated from wiki data */
const SYNC_FIELDS = ["name", "image", "link", "creditPrice", "ducatPrice", "type", "offeringDates"] as const;

export interface SyncResult {
    totalWikiItems: number;
    matchedItems: number;
    updatedItems: number;
    newItems: number;
    unmatchedWikiItems: string[];
    changes: { name: string; fieldsUpdated: string[] }[];
}

/**
 * Compares a wiki item to a DB item and returns an object with only the changed fields.
 * Returns null if nothing changed.
 */
export function getChangedFields(
    wikiItem: { name: string; image: string; link: string; creditPrice: number; ducatPrice: number; type: string; offeringDates: string[] },
    dbItem: Record<string, any>
): Record<string, any> | null {
    const updates: Record<string, any> = {};

    for (const field of SYNC_FIELDS) {
        const wikiValue = wikiItem[field];
        const dbValue = dbItem[field];

        if (field === "offeringDates") {
            const wikiDates = [...(wikiValue as string[])].sort();
            const dbDates = [...(dbValue as string[] || [])].sort();
            if (JSON.stringify(wikiDates) !== JSON.stringify(dbDates)) {
                updates[field] = wikiDates;
            }
        } else if (wikiValue !== dbValue) {
            updates[field] = wikiValue;
        }
    }

    return Object.keys(updates).length > 0 ? updates : null;
}

/**
 * Syncs pre-mapped wiki items into the database.
 * Only updates fields that differ. Preserves _id, likes, reviews, uniqueName,
 * wishlistPushTokens, and wishlistCount.
 */
export async function syncItems(wikiItems: Item[]): Promise<SyncResult> {
    await connectToDatabase();
    if (!collections.items) throw new Error("Items collection not initialized");

    console.log(`[Sync] Syncing ${wikiItems.length} items...`);

    const result: SyncResult = {
        totalWikiItems: wikiItems.length,
        matchedItems: 0,
        updatedItems: 0,
        newItems: 0,
        unmatchedWikiItems: [],
        changes: [],
    };

    for (const wikiItem of wikiItems) {
        // Match by name (case-insensitive)
        const dbItem = await collections.items.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(wikiItem.name)}$`, "i") },
        });

        if (!dbItem) {
            // Insert new item that doesn't exist in DB yet
            await collections.items.insertOne({
                name: wikiItem.name,
                image: wikiItem.image,
                link: wikiItem.link,
                creditPrice: wikiItem.creditPrice,
                ducatPrice: wikiItem.ducatPrice,
                type: wikiItem.type,
                offeringDates: wikiItem.offeringDates,
                likes: [],
                reviews: [],
                wishlistPushTokens: [],
                wishlistCount: 0,
            } as any);
            result.newItems++;
            console.log(`[Sync] Inserted new item: "${wikiItem.name}"`);
            continue;
        }

        result.matchedItems++;

        const changes = getChangedFields(wikiItem, dbItem);
        if (changes) {
            await collections.items.updateOne(
                { _id: dbItem._id },
                { $set: changes }
            );
            result.updatedItems++;
            result.changes.push({
                name: wikiItem.name,
                fieldsUpdated: Object.keys(changes),
            });
            console.log(`[Sync] Updated "${wikiItem.name}": ${Object.keys(changes).join(", ")}`);
        }
    }

    console.log(`[Sync] Complete — matched: ${result.matchedItems}, updated: ${result.updatedItems}, new: ${result.newItems}`);
    return result;
}


function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
