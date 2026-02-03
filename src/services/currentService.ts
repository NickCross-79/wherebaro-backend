import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";
import Item from "../models/Item";

export interface CurrentBaroData {
    isActive: boolean;
    activation: string;
    expiry: string;
    location: string;
    items: any[];
}

const BARO_API_URL = "https://api.warframestat.us/pc/voidTrader/";

interface BaroApiInventoryItem {
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

async function insertNewItemIfMissing(itemName: string, itemData: BaroApiInventoryItem, today: string): Promise<void> {
    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const existingItem = await collections.items.findOne({ name: itemName });

    if (!existingItem) {
        const newItem = new Item(
            itemName,
            "",
            "",
            itemData?.credits ?? 0,
            itemData?.ducats ?? 0,
            "Unknown",
            [today],
            [],
            []
        );

        await collections.items.insertOne(newItem as unknown as Item);
    }
}

async function matchInventoryToItemIds(inventoryNames: string[]): Promise<ObjectId[]> {
    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const matchedItems = await collections.items
        .find({ name: { $in: inventoryNames } })
        .toArray();

    const itemIdByName = new Map(matchedItems.map((item: any) => [item.name, item._id]));

    return inventoryNames
        .map((name) => itemIdByName.get(name))
        .filter((id): id is ObjectId => Boolean(id));
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

async function updateOfferingDates(inventoryNames: string[], today: string): Promise<void> {
    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    await collections.items.updateMany(
        { name: { $in: inventoryNames } },
        { $addToSet: { offeringDates: today } }
    );
}

/**
 * Updates the current Baro data from the external API
 * @returns Object with update status and details
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

    const inventoryNames = baroData.inventory
        .map((entry) => entry.item)
        .filter((name) => Boolean(name));

    if (inventoryNames.length === 0) {
        return { updated: false, reason: "No inventory names found" };
    }

    const today = now.toISOString().split("T")[0];

    // Insert newest item if it doesn't exist
    const newestItemName = inventoryNames[0];
    const newestItemData = baroData.inventory[0];
    await insertNewItemIfMissing(newestItemName, newestItemData, today);

    // Match inventory names to item IDs
    const inventoryIds = await matchInventoryToItemIds(inventoryNames);

    // Update the current collection
    await updateCurrentCollection(baroData, inventoryIds);

    // Update offering dates for all items in inventory
    await updateOfferingDates(inventoryNames, today);

    return {
        updated: true,
        inventoryCount: inventoryIds.length,
        activation: baroData.activation,
        expiry: baroData.expiry
    };
}
