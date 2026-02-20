/**
 * Service for managing the `current` collection document.
 * This single document tracks Baro Ki'Teer's status, location,
 * activation/expiry times, and his current inventory (as item ObjectIds).
 *
 * Pure DB operations only — no external API calls or item resolution.
 * Orchestration (fetch → resolve → store) lives in the jobs layer.
 */
import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CurrentBaroData {
    isActive: boolean;
    activation: string;
    expiry: string;
    location: string;
    items: any[];
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
 * Upserts the single `current` document with Baro's status and inventory.
 * Accepts plain fields — no dependency on API response types.
 */
export async function upsertCurrent(
    isActive: boolean,
    activation: string,
    expiry: string,
    location: string,
    inventoryIds: ObjectId[] = []
): Promise<void> {
    await connectToDatabase();

    if (!collections.current) {
        throw new Error("Current collection not initialized");
    }

    await collections.current.updateOne(
        {},
        {
            $set: {
                isActive,
                activation,
                expiry,
                location: location || "",
                inventory: inventoryIds,
            },
        },
        { upsert: true }
    );
}
