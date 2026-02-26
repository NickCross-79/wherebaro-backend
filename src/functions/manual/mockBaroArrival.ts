/**
 * Manual trigger: DEV/TEST ONLY — Simulates a full Baro arrival using the
 * inventory stored in the `mockCurrent` collection instead of hitting the
 * real Warframestat API.
 *
 * Runs the exact same pipeline as the real Friday arrival job:
 *   1. Load mock Baro data from `mockCurrent`
 *   2. Resolve inventory items against the DB (creates new items as needed)
 *   3. Upsert the `current` document
 *   4. Send arrival + wishlist push notifications
 *
 * Update the document in MongoDB Atlas to change mock behavior without redeploying.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase, db } from "../../db/database.service";
import { resolveBaroInventory } from "../../services/itemService";
import { upsertCurrent } from "../../services/currentService";
import { sendBaroArrivalNotification, sendWishlistMatchNotification } from "../../services/notificationService";
import { getWishlistMatchesForCurrentInventory } from "../../services/wishlistService";
import { BaroApiInventoryItem } from "../../services/baroApiService";

export async function mockBaroArrivalHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Mock Arrival] Triggered at ${new Date().toISOString()}`);

    try {
        await connectToDatabase();

        // ── Load mock document ────────────────────────────────────────────────
        const mockDoc = await db.collection("mockCurrent").findOne({});

        if (!mockDoc) {
            return {
                status: 404,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "No document found in mockCurrent collection" }),
            };
        }

        const { activation, expiry, location, inventory } = mockDoc as unknown as {
            activation: string;
            expiry: string;
            location: string;
            inventory: BaroApiInventoryItem[];
        };

        context.log(`[Mock Arrival] Using mock data: location="${location}", ${inventory?.length ?? 0} items`);

        // ── Resolve inventory against DB ──────────────────────────────────────
        let inventoryIds: import("mongodb").ObjectId[] = [];
        let unmatchedItems: string[] = [];

        if (inventory?.length > 0) {
            const resolved = await resolveBaroInventory(inventory);
            inventoryIds = resolved.inventoryIds;
            unmatchedItems = resolved.unmatchedItems;
        } else {
            context.warn("[Mock Arrival] mockCurrent inventory is empty");
        }

        // ── Upsert current document ───────────────────────────────────────────
        await upsertCurrent(true, activation, expiry, location, inventoryIds);
        context.log(`[Mock Arrival] Upserted current — ${inventoryIds.length} items resolved`);

        // ── Send arrival notification ─────────────────────────────────────────
        await sendBaroArrivalNotification(location);

        // ── Send targeted wishlist notifications ──────────────────────────────
        let wishlistSent = 0;
        try {
            const wishlistMatches = await getWishlistMatchesForCurrentInventory();
            for (const [token, itemNames] of wishlistMatches) {
                const result = await sendWishlistMatchNotification(token, itemNames);
                if (result.success) wishlistSent++;
            }
        } catch (wishlistError) {
            context.error("[Mock Arrival] Error sending wishlist notifications:", wishlistError as Error);
        }

        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "Mock Baro arrival completed",
                result: {
                    location,
                    activation,
                    expiry,
                    totalApiItems: inventory?.length ?? 0,
                    inventoryCount: inventoryIds.length,
                    unmatchedItems,
                    wishlistSent,
                },
            }),
        };
    } catch (error) {
        context.error("[Mock Arrival] Failed:", error as Error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Mock Baro arrival failed", details }),
        };
    }
}

app.http("mockBaroArrival", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: mockBaroArrivalHttp,
});