import { collections, connectToDatabase } from "../db/database.service.js";
import { ObjectId } from "mongodb";

export interface CurrentBaroData {
    isActive: boolean;
    activation: string;
    expiry: string;
    location: string;
    items: any[];
}

export async function fetchBaroCurrent(): Promise<CurrentBaroData> {
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
