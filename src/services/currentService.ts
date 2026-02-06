import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";
import Item from "../models/Item";
import Items from "@wfcd/items";
import { isIgnoredBaroItem } from "../utils/itemMappings";

export interface CurrentBaroData {
    isActive: boolean;
    activation: string;
    expiry: string;
    location: string;
    items: any[];
}

const BARO_API_URL = "https://api.warframestat.us/pc/voidTrader/";
const WF_CDN_BASE = "https://cdn.warframestat.us/img";

interface BaroApiInventoryItem {
    uniqueName: string;
    item: string;
    ducats: number;
    credits: number;
}

interface BaroApiResponse {
    activation: string;
    expiry: string;
    location: string;
    inventory: BaroApiInventoryItem[];
}

interface WfcdItem {
    name: string;
    uniqueName: string;
    imageName?: string;
    type?: string;
    category?: string;
    description?: string;
}

/**
 * Extracts the last segment from a uniqueName path.
 * e.g. "/Lotus/StoreItems/Types/Items/ShipDecos/Foo" -> "Foo"
 */
function getUniqueNameSuffix(uniqueName: string): string {
    const parts = uniqueName.split("/");
    return parts[parts.length - 1];
}

/**
 * Looks up a Warframe item by the last segment of its uniqueName
 * using the @wfcd/items library.
 */
function lookupWfcdItem(uniqueNameSuffix: string): WfcdItem | null {
    const items = new Items();
    const results = (items as any[]).filter(
        (item: WfcdItem) => item.uniqueName && item.uniqueName.endsWith(`/${uniqueNameSuffix}`)
    );
    return results.length > 0 ? results[0] : null;
}

/**
 * Fetches the current Baro Ki'Teer status and inventory
 * @returns CurrentBaroData object with status and items
 */
export async function fetchCurrent(): Promise<CurrentBaroData> {
    await connectToDatabase();

    if (!collections.current) {
        throw new Error("Current collection not initialized");
    }

    // Get the single current record
    const currentRecord = await collections.current.findOne({});

    if (!currentRecord) {
        // No record exists, return default inactive state
        return {
            isActive: false,
            activation: new Date().toISOString(),
            expiry: new Date().toISOString(),
            location: "",
            items: []
        };
    }

    // If Baro is active, populate inventory with full item objects
    if (currentRecord.isActive && currentRecord.inventory && currentRecord.inventory.length > 0) {
        // Extract item IDs from inventory
        const itemIds = currentRecord.inventory
            .map((item: any) => {
                if (typeof item === 'string') {
                    return new ObjectId(item);
                } else if (item._id) {
                    return item._id;
                }
                return null;
            })
            .filter((id: any) => id !== null);

        if (itemIds.length > 0 && collections.items) {
            // Fetch full item objects from items collection
            const fullItems = await collections.items
                .find({ _id: { $in: itemIds } })
                .toArray();

            return {
                isActive: true,
                activation: currentRecord.activation,
                expiry: currentRecord.expiry,
                location: currentRecord.location,
                items: fullItems
            };
        }
    }

    // Baro is not active or no inventory
    return {
        isActive: false,
        activation: currentRecord.activation,
        expiry: currentRecord.expiry,
        location: currentRecord.location,
        items: []
    };
}

function isBaroActive(activation: string, expiry: string, now: Date): boolean {
    const activationDate = new Date(activation);
    const expiryDate = new Date(expiry);
    return now >= activationDate && now <= expiryDate;
}

async function fetchBaroDataFromApi(): Promise<BaroApiResponse> {
    const response = await fetch(BARO_API_URL);

    if (!response.ok) {
        throw new Error(`Failed to fetch Baro data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const baroData: BaroApiResponse | undefined = Array.isArray(data) ? data[0] : data;

    if (!baroData || !baroData.inventory || baroData.inventory.length === 0) {
        throw new Error("Invalid or empty Baro data received from API");
    }

    return baroData;
}

/**
 * Resolves a Baro API inventory item to an existing DB item, or creates a new one.
 * Uses uniqueName suffix matching against the items collection.
 * Falls back to the @wfcd/items library for name, type, and image of new items.
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

    // Try to find item in DB by uniqueName (regex match on suffix)
    const existingItem = await collections.items.findOne({
        uniqueName: { $regex: new RegExp(`/${suffix}$`) }
    });

    if (existingItem) {
        // Update offering date
        await collections.items.updateOne(
            { _id: existingItem._id },
            { $addToSet: { offeringDates: today } }
        );
        return existingItem._id;
    }

    // Item not in DB — look it up in @wfcd/items for proper metadata
    const wfcdItem = lookupWfcdItem(suffix);

    if (wfcdItem) {
        const imageUrl = wfcdItem.imageName
            ? `${WF_CDN_BASE}/${wfcdItem.imageName}`
            : "";

        const newItem = new Item(
            wfcdItem.name,
            imageUrl,
            "",  // link — wiki page won't exist yet for brand-new items
            entry.credits ?? 0,
            entry.ducats ?? 0,
            wfcdItem.type || wfcdItem.category || "Unknown",
            [today],
            [],
            [],
            wfcdItem.uniqueName
        );

        const result = await collections.items.insertOne(newItem as any);
        console.log(`[Baro Update] Inserted new item: "${wfcdItem.name}" (uniqueName: ${wfcdItem.uniqueName})`);
        return result.insertedId;
    }

    // Item not found in DB or wfcd library — log to unknownItems collection
    console.warn(`[Baro Update] Unknown item: "${entry.item}" (uniqueName: ${entry.uniqueName}, suffix: ${suffix})`);
    await logUnknownItem(entry, isFirstItem);
    return null;
}

/**
 * Logs an unresolved inventory item to the unknownItems collection for manual review.
 */
async function logUnknownItem(entry: BaroApiInventoryItem, isFirstItem: boolean): Promise<void> {
    if (!collections.unknownItems) {
        console.warn(`[Baro Update] unknownItems collection not available, skipping log for "${entry.item}"`);
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
                $setOnInsert: {
                    firstSeen: new Date().toISOString(),
                }
            },
            { upsert: true }
        );
        console.log(`[Baro Update] Logged unknown item to DB: "${entry.item}"${isFirstItem ? " (NEW ITEM)" : ""}`);
    } catch (error) {
        console.error(`[Baro Update] Failed to log unknown item "${entry.item}":`, error);
    }
}

async function updateCurrentCollection(baroData: BaroApiResponse, inventoryIds: ObjectId[]): Promise<void> {
    if (!collections.current) {
        throw new Error("Current collection not initialized");
    }

    await collections.current.updateOne(
        {},
        {
            $set: {
                isHere: true,
                isActive: true,
                activation: baroData.activation,
                expiry: baroData.expiry,
                location: baroData.location,
                inventory: inventoryIds
            }
        },
        { upsert: true }
    );
}

/**
 * Updates the current Baro data from the external API.
 * Matches inventory items to the DB using uniqueName suffix matching.
 * New items are resolved via @wfcd/items for proper name, type, and image.
 */
export async function updateCurrentFromApi() {
    const baroData = await fetchBaroDataFromApi();

    const now = new Date();
    const isHere = isBaroActive(baroData.activation, baroData.expiry, now);

    if (!isHere) {
        return { updated: false, reason: "Baro is not active" };
    }

    await connectToDatabase();

    if (!collections.current || !collections.items) {
        throw new Error("Database collections not initialized");
    }

    if (baroData.inventory.length === 0) {
        return { updated: false, reason: "No inventory items found" };
    }

    const today = now.toISOString().split("T")[0];

    // Resolve each inventory item to a DB item ID (insert new ones as needed)
    const inventoryIds: ObjectId[] = [];
    const unmatchedItems: string[] = [];
    const ignoredItems: string[] = [];

    for (let i = 0; i < baroData.inventory.length; i++) {
        const entry = baroData.inventory[i];
        const isFirstItem = i === 0;

        // Skip ignored items (Void Surplus, Mod Packs, etc.)
        if (isIgnoredBaroItem(entry.item)) {
            ignoredItems.push(entry.item);
            continue;
        }

        const itemId = await resolveOrInsertItem(entry, today, isFirstItem);
        if (itemId) {
            inventoryIds.push(itemId);
        } else {
            unmatchedItems.push(entry.item);
        }
    }

    if (ignoredItems.length > 0) {
        console.log(`[Baro Update] Ignored ${ignoredItems.length} items: ${ignoredItems.join(", ")}`);
    }

    // Update the current collection
    await updateCurrentCollection(baroData, inventoryIds);

    console.log(`[Baro Update] Matched ${inventoryIds.length}/${baroData.inventory.length} items`);
    if (unmatchedItems.length > 0) {
        console.warn(`[Baro Update] Unmatched items: ${unmatchedItems.join(", ")}`);
    }

    return {
        updated: true,
        inventoryCount: inventoryIds.length,
        totalApiItems: baroData.inventory.length,
        unmatchedItems,
        activation: baroData.activation,
        expiry: baroData.expiry
    };
}
