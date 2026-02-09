import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";
import Item from "../models/Item";
import Items from "@wfcd/items";
import { isIgnoredBaroItem } from "../utils/itemMappings";
import { BaroApiInventoryItem } from "./baroApiService";

const WF_CDN_BASE = "https://cdn.warframestat.us/img";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface WfcdItem {
    name: string;
    uniqueName: string;
    imageName?: string;
    type?: string;
    category?: string;
    description?: string;
}

// ─── WFCD Item Lookup ────────────────────────────────────────────────────────

/**
 * Extracts the last segment from a uniqueName path.
 * e.g. "/Lotus/StoreItems/Types/Items/ShipDecos/Foo" → "Foo"
 */
function getUniqueNameSuffix(uniqueName: string): string {
    return uniqueName.split("/").pop() || uniqueName;
}

/**
 * Looks up a Warframe item by the last segment of its uniqueName
 * using the @wfcd/items library.
 */
function lookupWfcdItem(suffix: string): WfcdItem | null {
    const items = new Items();
    return (
        (items as any[]).find(
            (item: WfcdItem) => item.uniqueName?.endsWith(`/${suffix}`)
        ) ?? null
    );
}

// ─── Item Resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a Baro API inventory item to an existing DB item, or creates a new one.
 * Uses uniqueName suffix matching, falling back to @wfcd/items for metadata.
 */
async function resolveOrInsertItem(
    entry: BaroApiInventoryItem,
    today: string,
    isFirstItem: boolean = false
): Promise<ObjectId | null> {
    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const suffix = getUniqueNameSuffix(entry.uniqueName);

    // Try to find existing item by uniqueName suffix
    const existingItem = await collections.items.findOne({
        uniqueName: { $regex: new RegExp(`/${suffix}$`) },
    });

    if (existingItem) {
        await collections.items.updateOne(
            { _id: existingItem._id },
            { $addToSet: { offeringDates: today } }
        );
        return existingItem._id;
    }

    // Look up in @wfcd/items for metadata
    const wfcdItem = lookupWfcdItem(suffix);
    if (wfcdItem) {
        const imageUrl = wfcdItem.imageName ? `${WF_CDN_BASE}/${wfcdItem.imageName}` : "";
        const newItem = new Item(
            wfcdItem.name,
            imageUrl,
            "",
            entry.credits ?? 0,
            entry.ducats ?? 0,
            wfcdItem.type || wfcdItem.category || "Unknown",
            [today],
            [],
            [],
            wfcdItem.uniqueName
        );

        const result = await collections.items.insertOne(newItem as any);
        console.log(`[Item Service] Inserted new item: "${wfcdItem.name}" (${wfcdItem.uniqueName})`);
        return result.insertedId;
    }

    // Unresolved — log for manual review
    console.warn(`[Item Service] Unknown item: "${entry.item}" (${entry.uniqueName})`);
    await logUnknownItem(entry, isFirstItem);
    return null;
}

/**
 * Logs an unresolved inventory item to the unknownItems collection.
 */
async function logUnknownItem(entry: BaroApiInventoryItem, isFirstItem: boolean): Promise<void> {
    if (!collections.unknownItems) {
        console.warn(`[Item Service] unknownItems collection unavailable, skipping "${entry.item}"`);
        return;
    }

    try {
        await collections.unknownItems.updateOne(
            { uniqueName: entry.uniqueName },
            {
                $set: {
                    apiItemName: entry.item,
                    uniqueName: entry.uniqueName,
                    ducats: entry.ducats,
                    credits: entry.credits,
                    isNewItem: isFirstItem,
                    lastSeen: new Date().toISOString(),
                },
                $setOnInsert: { firstSeen: new Date().toISOString() },
            },
            { upsert: true }
        );
        console.log(`[Item Service] Logged unknown item: "${entry.item}"${isFirstItem ? " (NEW)" : ""}`);
    } catch (error) {
        console.error(`[Item Service] Failed to log unknown item "${entry.item}":`, error);
    }
}

// ─── Exported Functions ──────────────────────────────────────────────────────

/**
 * Fetches all items from the database.
 */
export async function fetchAllItems(): Promise<Item[]> {
    await connectToDatabase();

    if (!collections.items) {
        throw new Error("Database collection not initialized");
    }

    const items = await collections.items.find({}).toArray();

    // Strip sensitive push tokens — return count only
    return items.map((item: any) => {
        const { wishlistPushTokens, ...rest } = item;
        return {
            ...rest,
            wishlistCount: Array.isArray(wishlistPushTokens) ? wishlistPushTokens.length : 0,
        };
    });
}

/**
 * Resolves a list of Baro API inventory items to DB item ObjectIds.
 * Creates new item records for previously unseen items.
 * Skips ignored items (Void Surplus, Mod Packs, etc.).
 * @returns Object with resolved item IDs and lists of unmatched/ignored items.
 */
export async function resolveBaroInventory(inventory: BaroApiInventoryItem[]): Promise<{
    inventoryIds: ObjectId[];
    unmatchedItems: string[];
    ignoredItems: string[];
}> {
    await connectToDatabase();

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const today = new Date().toISOString().split("T")[0];
    const inventoryIds: ObjectId[] = [];
    const unmatchedItems: string[] = [];
    const ignoredItems: string[] = [];

    for (let i = 0; i < inventory.length; i++) {
        const entry = inventory[i];

        if (isIgnoredBaroItem(entry.item)) {
            ignoredItems.push(entry.item);
            continue;
        }

        const itemId = await resolveOrInsertItem(entry, today, i === 0);
        if (itemId) inventoryIds.push(itemId);
        else unmatchedItems.push(entry.item);
    }

    if (ignoredItems.length > 0) {
        console.log(`[Item Service] Ignored ${ignoredItems.length} items: ${ignoredItems.join(", ")}`);
    }

    console.log(`[Item Service] Resolved ${inventoryIds.length}/${inventory.length} items`);
    if (unmatchedItems.length > 0) {
        console.warn(`[Item Service] Unmatched: ${unmatchedItems.join(", ")}`);
    }

    return { inventoryIds, unmatchedItems, ignoredItems };
}
