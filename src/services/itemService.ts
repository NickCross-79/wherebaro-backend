import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";
import Item from "../models/Item";
import Items from "@wfcd/items";
import { isIgnoredBaroItem } from "../utils/itemMappings";
import { BaroApiInventoryItem } from "./baroApiService";

const WF_CDN_BASE = "https://cdn.warframestat.us/img";

// Lazily cached @wfcd/items dataset
let wfcdItemsCache: WfcdItem[] | null = null;

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
 * Finds an existing DB item by uniqueName suffix match.
 */
async function findItemBySuffix(suffix: string) {
    return collections.items!.findOne({
        uniqueName: { $regex: new RegExp(`/${suffix}$`) },
    });
}

/**
 * Looks up a Warframe item by the last segment of its uniqueName
 * using the @wfcd/items library.
 */
function lookupWfcdItem(suffix: string): WfcdItem | null {
    if (!wfcdItemsCache) {
        wfcdItemsCache = new Items() as any as WfcdItem[];
    }
    return (
        wfcdItemsCache.find(
            (item) => item.uniqueName?.endsWith(`/${suffix}`)
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
    const existingItem = await findItemBySuffix(suffix);

    if (existingItem) {
        await collections.items.updateOne(
            { _id: existingItem._id },
            { $addToSet: { offeringDates: today } }
        );
        return existingItem._id;
    }

    // No match by uniqueName — try name-based fallback for items missing uniqueName
    const nameMatch = await collections.items.findOne({
        uniqueName: { $in: [null, undefined, ""] },
        name: entry.item,
    });

    if (nameMatch) {
        // Found by name — backfill the uniqueName and update offering dates
        await collections.items.updateOne(
            { _id: nameMatch._id },
            {
                $set: { uniqueName: entry.uniqueName },
                $addToSet: { offeringDates: today },
            }
        );
        console.log(`[Item Service] Matched "${entry.item}" by name, backfilled uniqueName: ${entry.uniqueName}`);
        return nameMatch._id;
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
            wfcdItem.uniqueName,
            [], // Initial empty wishlistPushTokens
            0   // Initial wishlistCount
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
 * Identifies and inserts the new item from a Baro visit.
 *
 * The first item in the API inventory array is typically the new item.
 * This function checks whether that item's uniqueName already exists in the DB:
 * - If it doesn't → it's genuinely new, insert it directly.
 * - If it does → the new item is elsewhere in the list. Cross-reference all
 *   API uniqueNames against the DB to find the one with no match, then insert that.
 *
 * @returns Map of uniqueName → ObjectId for items that were handled (inserted),
 *          so resolveBaroInventory can collect IDs without re-querying.
 */
async function insertNewItem(
    inventory: BaroApiInventoryItem[],
    today: string
): Promise<Map<string, ObjectId>> {
    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const handled = new Map<string, ObjectId>();
    const nonIgnored = inventory.filter((e) => !isIgnoredBaroItem(e.item));
    if (nonIgnored.length === 0) return handled;

    const firstEntry = nonIgnored[0];
    const firstSuffix = getUniqueNameSuffix(firstEntry.uniqueName);

    // Check if the first item's uniqueName is already in the DB
    const firstMatch = await findItemBySuffix(firstSuffix);

    if (!firstMatch) {
        // First item is genuinely new — insert it via the normal path
        console.log(`[Item Service] First inventory item "${firstEntry.item}" is new, inserting...`);
        const itemId = await resolveOrInsertItem(firstEntry, today, true);
        if (itemId) handled.set(firstEntry.uniqueName, itemId);
        return handled;
    }

    // First item already exists — the new item is somewhere else.
    // Cross-reference all API items against the DB to find the unmatched one.
    console.log(`[Item Service] First inventory item "${firstEntry.item}" already exists, searching for the actual new item...`);

    for (const entry of nonIgnored) {
        const suffix = getUniqueNameSuffix(entry.uniqueName);
        const exists = await findItemBySuffix(suffix);

        if (!exists) {
            console.log(`[Item Service] Found actual new item: "${entry.item}" (${entry.uniqueName})`);
            const itemId = await resolveOrInsertItem(entry, today, true);
            if (itemId) handled.set(entry.uniqueName, itemId);
            return handled;
        }
    }

    console.log(`[Item Service] No new items detected in this Baro visit`);
    return handled;
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

    // Strip sensitive push tokens — wishlistCount is stored as its own field
    return items.map((item: any) => {
        const { wishlistPushTokens, ...rest } = item;
        return rest;
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

    // First pass: identify and insert the new item for this Baro visit
    const handledItems = await insertNewItem(inventory, today);

    for (const entry of inventory) {
        if (isIgnoredBaroItem(entry.item)) {
            ignoredItems.push(entry.item);
            continue;
        }

        // Use ID from insertNewItem if already handled
        const handledId = handledItems.get(entry.uniqueName);
        if (handledId) {
            inventoryIds.push(handledId);
            continue;
        }

        const itemId = await resolveOrInsertItem(entry, today, false);
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
