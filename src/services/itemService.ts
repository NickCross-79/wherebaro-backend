import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";
import Item from "../models/Item";
import { isIgnoredBaroItem } from "../utils/itemMappings";
import { BaroApiInventoryItem } from "./baroApiService";
import {
    WfcdItem,
    getUniqueNameSuffix,
    lookupWfcdItem,
    getWfcdItems,
    buildWfcdNameMaps,
    findWfcdMatch,
} from "../utils/wfcdItems";
import generate from "../lib/mod-generator/generator";
import { storeTempModImage, MOD_IMAGE_SENTINEL } from "./tempModImageService";

const WF_CDN_BASE = "https://cdn.warframestat.us/img";

// ─── DB Lookup ───────────────────────────────────────────────────────────────

/**
 * Finds an existing DB item by uniqueName suffix match.
 */
async function findItemBySuffix(suffix: string) {
    return collections.items!.findOne({
        uniqueName: { $regex: new RegExp(`/${suffix}$`) },
    });
}

// ─── Item Resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a Baro API inventory item to an existing DB item, or creates a new one.
 * Uses uniqueName suffix matching, falling back to @wfcd/items for metadata.
 * @param isNewItem - true when this item was not in the DB before this Baro visit;
 *                    triggers mod image generation for newly introduced mods.
 */
async function resolveOrInsertItem(
    entry: BaroApiInventoryItem,
    today: string,
    isNewItem: boolean = false
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
        // If this is the new Baro mod item and the wiki won't have an image yet,
        // generate one locally and store it on the `current` document. The item's
        // image field is set to a sentinel so fetchCurrent can substitute the
        // generated image until the wiki sync job replaces it with the official one.
        const isNewMod = isNewItem && wfcdItem.category?.toLowerCase().includes("mod");
        const imageUrl = isNewMod
            ? MOD_IMAGE_SENTINEL
            : (wfcdItem.imageName ? `${WF_CDN_BASE}/${wfcdItem.imageName}` : "");

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

        if (isNewMod) {
            // Generate mod image and persist it in tempModImages (best-effort).
            // The document references this item's _id so fetchCurrent can look it up
            // and serve a data URI to the frontend until the wiki sync provides the real image.
            try {
                const imageBuffer = await generate(wfcdItem, { format: "png" }, wfcdItem.levelStats?.length ? wfcdItem.levelStats.length - 1 : 0);
                if (imageBuffer) {
                    await storeTempModImage(result.insertedId, imageBuffer.toString("base64"));
                    console.log(`[Item Service] Generated and stored temp mod image for new item: "${wfcdItem.name}"`);
                } else {
                    console.warn(`[Item Service] Mod image generation returned empty result for "${wfcdItem.name}"`);
                }
            } catch (err) {
                console.error(`[Item Service] Failed to generate mod image for "${wfcdItem.name}":`, err);
            }
        }

        return result.insertedId;
    }

    // Unresolved — log for manual review
    console.warn(`[Item Service] Unknown item: "${entry.item}" (${entry.uniqueName})`);
    await logUnknownItem(entry, isNewItem);
    return null;
}

/**
 * Identifies all genuinely new items in a Baro inventory by comparing every
 * non-ignored entry against the database in a single batch query.
 *
 * Strategy:
 * 1. Build a regex $or query for all uniqueName suffixes to find existing items.
 * 2. Any entry whose suffix has no DB match is a candidate new item.
 * 3. For candidates, also check the name-based fallback (items in DB that have
 *    no uniqueName yet) — if that matches, the item already exists.
 *
 * @returns Set of uniqueNames that are genuinely new (not in the DB yet).
 */
async function identifyNewItems(
    nonIgnored: BaroApiInventoryItem[]
): Promise<Set<string>> {
    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const newUniqueNames = new Set<string>();
    if (nonIgnored.length === 0) return newUniqueNames;

    const suffixes = nonIgnored.map((e) => getUniqueNameSuffix(e.uniqueName));

    // Batch query — find all DB items whose uniqueName ends with any of the suffixes
    const existing = await collections.items
        .find({ $or: suffixes.map((s) => ({ uniqueName: { $regex: new RegExp(`/${s}$`) } })) })
        .project({ uniqueName: 1 })
        .toArray();

    const foundSuffixes = new Set(existing.map((i: any) => getUniqueNameSuffix(i.uniqueName)));

    // Candidates: not matched by suffix — may still exist via name-based fallback
    const candidates = nonIgnored.filter((e) => !foundSuffixes.has(getUniqueNameSuffix(e.uniqueName)));

    for (const entry of candidates) {
        const nameMatch = await collections.items.findOne({
            uniqueName: { $in: [null, undefined, ""] },
            name: entry.item,
        });
        if (!nameMatch) {
            newUniqueNames.add(entry.uniqueName);
        }
    }

    if (newUniqueNames.size > 0) {
        console.log(`[Item Service] Detected ${newUniqueNames.size} new item(s) this Baro visit`);
    } else {
        console.log(`[Item Service] No new items detected in this Baro visit`);
    }

    return newUniqueNames;
}

/**
 * Logs an unresolved inventory item to the unknownItems collection.
 */
async function logUnknownItem(entry: BaroApiInventoryItem, isNewItem: boolean): Promise<void> {
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
                    isNewItem: isNewItem,
                    lastSeen: new Date().toISOString(),
                },
                $setOnInsert: { firstSeen: new Date().toISOString() },
            },
            { upsert: true }
        );
        console.log(`[Item Service] Logged unknown item: "${entry.item}"${isNewItem ? " (NEW)" : ""}`);
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

    const nonIgnored = inventory.filter((e) => !isIgnoredBaroItem(e.item));

    // Batch-compare all inventory uniqueNames against the DB to find every new item
    const newUniqueNames = await identifyNewItems(nonIgnored);

    for (const entry of inventory) {
        if (isIgnoredBaroItem(entry.item)) {
            ignoredItems.push(entry.item);
            continue;
        }

        const isNewItem = newUniqueNames.has(entry.uniqueName);
        const itemId = await resolveOrInsertItem(entry, today, isNewItem);
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

// ─── Backfill Unique Names ───────────────────────────────────────────────────

/**
 * Backfills the uniqueName field on all items in the DB that don't have one.
 * Uses the @wfcd/items library to match items by name and write the full uniqueName.
 */
export async function backfillUniqueNames(): Promise<{
    total: number;
    matched: number;
    unmatched: number;
    unmatchedNames: string[];
}> {
    await connectToDatabase();

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const { wfcdByExactName, wfcdByNormalized, allWfcdItems } = buildWfcdNameMaps();
    console.log(`[Backfill] Loaded ${wfcdByExactName.size} items from @wfcd/items library`);

    // Find all DB items missing a uniqueName
    const itemsToUpdate = await collections.items
        .find({ $or: [{ uniqueName: { $exists: false } }, { uniqueName: null }, { uniqueName: "" }] })
        .toArray();

    console.log(`[Backfill] Found ${itemsToUpdate.length} items without uniqueName`);

    let matched = 0;
    let unmatched = 0;
    const unmatchedNames: string[] = [];

    for (const dbItem of itemsToUpdate) {
        const itemName = (dbItem as any).name as string;
        if (!itemName) {
            unmatched++;
            continue;
        }

        const wfcdMatch = findWfcdMatch(itemName, wfcdByExactName, wfcdByNormalized, allWfcdItems);

        if (wfcdMatch) {
            await collections.items.updateOne(
                { _id: dbItem._id },
                { $set: { uniqueName: wfcdMatch.uniqueName } }
            );
            matched++;
        } else {
            unmatched++;
            unmatchedNames.push(itemName);
        }
    }

    console.log(`[Backfill] Results: ${matched} matched, ${unmatched} unmatched`);
    if (unmatchedNames.length > 0) {
        console.log(`[Backfill] Unmatched items: ${unmatchedNames.join(", ")}`);
    }

    return { total: itemsToUpdate.length, matched, unmatched, unmatchedNames };
}