/**
 * Service for managing the `current` collection document.
 * This single document tracks Baro Ki'Teer's status, location,
 * activation/expiry times, and his current inventory (as item ObjectIds).
 */
import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";
import { fetchBaroData, isBaroActive, BaroApiResponse } from "./baroApiService";
import { resolveBaroInventory } from "./itemService";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CurrentBaroData {
    isActive: boolean;
    activation: string;
    expiry: string;
    location: string;
    items: any[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Upserts the single `current` document with Baro's status and inventory.
 */
async function upsertCurrentDocument(
    isActive: boolean,
    baroData: BaroApiResponse,
    inventoryIds: ObjectId[] = []
): Promise<void> {
    if (!collections.current) {
        throw new Error("Current collection not initialized");
    }

    await collections.current.updateOne(
        {},
        {
            $set: {
                isActive,
                activation: baroData.activation,
                expiry: baroData.expiry,
                location: baroData.location || "",
                inventory: inventoryIds,
            },
        },
        { upsert: true }
    );
}

// ─── Exported Functions ──────────────────────────────────────────────────────

/**
 * Reads the current Baro status and inventory from the DB.
 * Populates inventory with full item objects when Baro is active.
 */
export async function fetchCurrent(): Promise<CurrentBaroData> {
    await connectToDatabase();

    if (!collections.current) {
        throw new Error("Current collection not initialized");
    }

    const record = await collections.current.findOne({});
    if (!record) {
        return { isActive: false, activation: new Date().toISOString(), expiry: new Date().toISOString(), location: "", items: [] };
    }

    // Populate inventory with full item objects if Baro is active
    if (record.isActive && record.inventory?.length > 0 && collections.items) {
        const itemIds = record.inventory
            .map((item: any) => (typeof item === "string" ? new ObjectId(item) : item._id ?? item))
            .filter(Boolean);

        const fullItems = await collections.items.find({ _id: { $in: itemIds } }).toArray();

        return {
            isActive: true,
            activation: record.activation,
            expiry: record.expiry,
            location: record.location,
            items: fullItems,
        };
    }

    return {
        isActive: record.isActive || false,
        activation: record.activation,
        expiry: record.expiry,
        location: record.location,
        items: [],
    };
}

/**
 * Fetches Baro data from the external API and updates the `current` document.
 * - Baro absent: stores inactive status with next arrival time, clears inventory.
 * - Baro active: delegates item resolution to itemService, then stores the IDs.
 */
export async function updateCurrentFromApi() {
    const baroData = await fetchBaroData();
    const now = new Date();
    const isHere = isBaroActive(baroData.activation, baroData.expiry, now);

    await connectToDatabase();
    if (!collections.current) {
        throw new Error("Current collection not initialized");
    }

    // Baro is absent
    if (!isHere) {
        await upsertCurrentDocument(false, baroData);
        console.log(`[Current] Baro is not active. Next arrival: ${baroData.activation}`);
        return { updated: true, isActive: false, activation: baroData.activation, expiry: baroData.expiry };
    }

    // Baro is active but API returned no inventory
    if (baroData.inventory.length === 0) {
        await upsertCurrentDocument(true, baroData);
        console.warn(`[Current] Baro is active but API returned no inventory`);
        return { updated: true, isActive: true, inventoryCount: 0, activation: baroData.activation, expiry: baroData.expiry };
    }

    // Resolve inventory items via itemService, then store the IDs
    const { inventoryIds, unmatchedItems } = await resolveBaroInventory(baroData.inventory);
    await upsertCurrentDocument(true, baroData, inventoryIds);

    return {
        updated: true,
        isActive: true,
        inventoryCount: inventoryIds.length,
        totalApiItems: baroData.inventory.length,
        unmatchedItems,
        activation: baroData.activation,
        expiry: baroData.expiry,
    };
}
