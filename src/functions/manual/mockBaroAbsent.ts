/**
 * Manual trigger: DEV/TEST ONLY — Returns a warframestat.us-shaped absent
 * response using the real `current` document. Overrides activation/expiry so
 * the countdown is always ARRIVAL_COUNTDOWN_SECONDS from now.
 *
 * Use this to simulate a Baro arrival on the frontend:
 * 1. Point frontend's initial fetch at this endpoint
 * 2. Timer counts down ARRIVAL_COUNTDOWN_SECONDS, expires
 * 3. Frontend polls getCurrent until Baro is confirmed active
 * 4. Full arrival flow completes using only real data
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase, collections, db } from "../../db/database.service";
import { ObjectId } from "mongodb";

/** Seconds from now until the simulated Baro arrival fires. */
const ARRIVAL_COUNTDOWN_SECONDS = 30;

export async function mockBaroAbsentHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Mock Absent] Triggered at ${new Date().toISOString()}`);

    try {
        await connectToDatabase();

        const currentDoc = await collections.current!.findOne({});

        if (!currentDoc) {
            return {
                status: 404,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "No document found in current collection" }),
            };
        }

        const { activation: rawActivation, expiry: rawExpiry, location, inventory: inventoryIds } = currentDoc as any;

        // Compute the original visit duration so expiry stays proportional
        const originalDurationMs =
            rawActivation && rawExpiry
                ? new Date(rawExpiry).getTime() - new Date(rawActivation).getTime()
                : 6 * 24 * 60 * 60 * 1000; // default: 6 days

        const now = new Date();
        const activation = new Date(now.getTime() + ARRIVAL_COUNTDOWN_SECONDS * 1000);
        const expiry = new Date(activation.getTime() + originalDurationMs);

        // Populate ObjectId inventory into warframestat-shaped items
        let inventory: any[] = [];
        if (Array.isArray(inventoryIds) && inventoryIds.length > 0) {
            const ids = inventoryIds.map((id: any) => (id instanceof ObjectId ? id : new ObjectId(id)));
            const items = await collections.items!.find({ _id: { $in: ids } }).toArray();
            inventory = items.map((item: any) => ({
                uniqueName: item.uniqueName || "",
                item: item.name || "",
                ducats: item.ducatPrice ?? 0,
                credits: item.creditPrice ?? 0,
            }));
        }

        const response = {
            isActive: false,
            activation: activation.toISOString(),
            expiry: expiry.toISOString(),
            location: location || "",
            inventory,
        };

        context.log(`[Mock Absent] Baro arrives in ${ARRIVAL_COUNTDOWN_SECONDS}s → activation=${response.activation}, inventory=${inventory.length} items`);

        return {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(response),
        };
    } catch (error: any) {
        context.error(`[Mock Absent] Error: ${error.message}`);
        return {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message }),
        };
    }
}

app.http("mockBaroAbsent", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: mockBaroAbsentHttp,
});
