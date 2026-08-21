import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";
import Item from "../models/Item";
import { isIgnoredBaroItem } from "../utils/itemMappings";
import { escapeRegex } from "../utils/regex";
import { BaroApiInventoryItem } from "./baroApiService";
import {
    WfcdItem,
    getUniqueNameKey,
    lookupWfcdItem,
    getWfcdItems,
    buildWfcdNameMaps,
    findWfcdMatch,
} from "../utils/wfcdItems";
import { storeTempModImage, MOD_IMAGE_SENTINEL } from "./tempModImageService";
import { generateModImage } from "./modGeneratorLoader";

// ─── DB Lookup ───────────────────────────────────────────────────────────────

/**
 * Builds the canonical uniqueName we store for an item: the `/Lotus/<key>` form,
 * with any `/StoreItems` segment stripped. The Baro API serves store paths
 * (`/Lotus/StoreItems/Types/...`) while the world state and @wfcd/items serve the
 * plain form, so the same item arrives spelled two ways depending on the source.
 * Normalizing on write keeps one item from being stored under both.
 */
function canonicalUniqueName(uniqueName: string): string {
    return `/Lotus/${getUniqueNameKey(uniqueName)}`;
}

/**
 * Finds the existing DB document for a Baro inventory entry, if there is one.
 *
 * Identity has to be decided the same way everywhere that writes to this
 * collection, or the same item ends up stored twice. The wiki sync matches names
 * case-insensitively, so this must too: matching only byte-for-byte meant any
 * drift between the wiki's spelling and the API's — a capital letter, a
 * different apostrophe — read as a brand new item. The duplicate is then
 * inserted with `offeringDates: [today]`, and a single offering date is exactly
 * what the app renders as a NEW badge, so a long-standing item comes back
 * flagged as never seen before.
 *
 * Ordered cheapest first; the exact match is the common case.
 */
async function findExistingBaroItem(entry: BaroApiInventoryItem) {
    const items = collections.items!;

    // 1. Exact name
    const exact = await items.findOne({ name: entry.item });
    if (exact) return exact;

    // 2. Case-insensitive name — the rule syncService uses to decide the same question
    if (entry.item) {
        const caseInsensitive = await items.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(entry.item)}$`, "i") },
        });
        if (caseInsensitive) return caseInsensitive;
    }

    // 3. uniqueName key, accepting either stored prefix form. Items backfilled
    //    from a raw Baro API path still carry the `/Lotus/StoreItems/...` spelling.
    if (entry.uniqueName) {
        const key = getUniqueNameKey(entry.uniqueName);
        const byKey = await items.findOne({
            uniqueName: { $in: [`/Lotus/${key}`, `/Lotus/StoreItems/${key}`] },
        });
        if (byKey) return byKey;
    }

    return null;
}

// ─── Item Resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a Baro API inventory item to an existing DB item, or creates a new one.
 * Uses name matching first, falling back to uniqueName suffix, then @wfcd/items for metadata.
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

    const existing = await findExistingBaroItem(entry);

    if (existing) {
        const update: any = { $addToSet: { offeringDates: today } };
        if (!existing.uniqueName && entry.uniqueName) {
            // Store the canonical form, not the raw API path — the raw store path
            // is not what the uniqueName lookup searches for, so backfilling it
            // verbatim left the item unfindable by key on the next visit.
            const canonical = canonicalUniqueName(entry.uniqueName);
            update.$set = { uniqueName: canonical };
            console.log(`[Item Service] Matched "${entry.item}", backfilled uniqueName: ${canonical}`);
        }
        await collections.items.updateOne({ _id: existing._id }, update);
        return existing._id;
    }

    // Look up in @wfcd/items for metadata
    const wfcdItem = lookupWfcdItem(entry.uniqueName);
    if (wfcdItem) {
        // If this is the new Baro mod item and the wiki won't have an image yet,
        // generate one locally and store it on the `current` document. The item's
        // image field is set to a sentinel so fetchCurrent can substitute the
        // generated image until the wiki sync job replaces it with the official one.
        const isNewMod = isNewItem && wfcdItem.category?.toLowerCase().includes("mod");
        const wikiImageLink = isNewMod ? MOD_IMAGE_SENTINEL : "";
        const cdnImageLink = wfcdItem.imageName ?? "";

        const newItem = new Item(
            wfcdItem.name,
            wikiImageLink,
            cdnImageLink,
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

        // Use majority write concern so the document is visible to all replica-set
        // members before resolveBaroInventory returns. Without this, a full collection
        // scan (getAllItems) immediately after can miss the new document.
        const result = await collections.items.insertOne(newItem as any, { writeConcern: { w: "majority" } });
        console.log(`[Item Service] Inserted new item: "${wfcdItem.name}" (${wfcdItem.uniqueName})`);

        if (isNewMod) {
            // Generate mod image and persist it in tempModImages (best-effort).
            // The document references this item's _id so fetchCurrent can look it up
            // and serve a data URI to the frontend until the wiki sync provides the real image.
            try {
                const rank = wfcdItem.levelStats?.length ? wfcdItem.levelStats.length - 1 : 0;
                const imageBuffer = await generateModImage(wfcdItem as any, rank);
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
 * 1. Batch query by name to find existing items.
 * 2. Any entry whose name has no DB match is a candidate new item.
 * 3. For candidates, batch-check by uniqueName suffix as a fallback —
 *    if that matches, the item already exists.
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

    // Primary batch query — find all DB items whose name matches any inventory item
    const names = nonIgnored.map((e) => e.item).filter(Boolean);
    const existingByName = await collections.items
        .find({ name: { $in: names } })
        .project({ name: 1 })
        .toArray();

    const foundNames = new Set(existingByName.map((i: any) => i.name));

    // Candidates: not matched by name — may still exist via uniqueName suffix fallback
    const candidates = nonIgnored.filter((e) => !foundNames.has(e.item));

    if (candidates.length > 0) {
        const uniqueNames = candidates.map((e) => `/Lotus/${getUniqueNameKey(e.uniqueName)}`);
        const existingByUniqueName = await collections.items
            .find({ uniqueName: { $in: uniqueNames } })
            .project({ uniqueName: 1 })
            .toArray();

        const foundKeys = new Set(existingByUniqueName.map((i: any) => getUniqueNameKey(i.uniqueName)));

        for (const entry of candidates) {
            if (!foundKeys.has(getUniqueNameKey(entry.uniqueName))) {
                newUniqueNames.add(entry.uniqueName);
            }
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
 * Vote counts come from the item's buy[] and skip[] arrays.
 */
export async function fetchAllItems(): Promise<Item[]> {
    await connectToDatabase();

    if (!collections.items) {
        throw new Error("Database collection not initialized");
    }

    const items = await collections.items.find({}).toArray();

    // Strip sensitive push tokens, ensure buy/skip arrays exist
    return items.map((item: any) => {
        const { wishlistPushTokens, ...rest } = item;
        return {
            ...rest,
            buy: rest.buy ?? [],
            skip: rest.skip ?? [],
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

// ─── Backfill Item Data ──────────────────────────────────────────────────────

/**
 * Backfills missing `uniqueName` and `cdnImageLink` fields on all items in the DB.
 * Uses the @wfcd/items library to match items by name.
 */
export async function backfillItemData(): Promise<{
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

    // Fetch all items — cdnImageLink is always refreshed; uniqueName is only filled when missing
    const itemsToUpdate = await collections.items.find({}).toArray();

    console.log(`[Backfill] Found ${itemsToUpdate.length} items to process`);

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
            const update: Record<string, any> = {};
            if (!(dbItem as any).uniqueName) {
                update.uniqueName = wfcdMatch.uniqueName;
            }
            update.cdnImageLink = wfcdMatch.imageName ?? "";
            if (Object.keys(update).length > 0) {
                await collections.items.updateOne({ _id: dbItem._id }, { $set: update });
            }
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