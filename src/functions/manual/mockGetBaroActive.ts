/**
 * Manual trigger: DEV/TEST ONLY — Returns a warframestat.us-shaped Baro
 * response with Baro marked as *currently active*, drawing the inventory
 * from the `mockCurrent` collection.
 *
 * Used by the frontend during arrival simulation as the data source for
 * the final `fetchBaroData` call once the countdown fires and the poll
 * confirms Baro has arrived. The activation/expiry times are overridden
 * at runtime so that `isBaroActive()` always evaluates to `true`:
 *   • activation  = now − 1 h  (Baro already arrived)
 *   • expiry      = activation + original visit duration
 *
 * Inventory shape matches warframestat.us:
 *   [{ uniqueName, item, ducats, credits }]
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase, db } from "../../db/database.service";

/** How far in the past to place activation so isBaroActive() returns true. */
const ACTIVE_OFFSET_MS = 60 * 60 * 1000; // 1 hour

export async function mockGetBaroActiveHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Mock GetBaroActive] Triggered at ${new Date().toISOString()}`);

    try {
        await connectToDatabase();

        const mockDoc = await db.collection("mockCurrent").findOne({});

        if (!mockDoc) {
            context.log("[Mock GetBaroActive] No document found in mockCurrent collection");
            return {
                status: 404,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "No mock data found in mockCurrent collection" }),
            };
        }

        const { _id, activation: rawActivation, expiry: rawExpiry, isActive: _ignored, ...rest } = mockDoc as any;

        // Preserve the original visit duration so expiry stays proportional
        const originalDurationMs =
            rawActivation && rawExpiry
                ? new Date(rawExpiry).getTime() - new Date(rawActivation).getTime()
                : 6 * 24 * 60 * 60 * 1000; // default: 6 days

        const now = new Date();
        const activation = new Date(now.getTime() - ACTIVE_OFFSET_MS);
        const expiry = new Date(activation.getTime() + originalDurationMs);

        const response = {
            ...rest,                          // includes location, inventory
            isActive: true,
            activation: activation.toISOString(),
            expiry: expiry.toISOString(),
        };

        context.log(
            `[Mock GetBaroActive] Returning isActive=true, location="${response.location}", ` +
            `inventory=${response.inventory?.length ?? 0} items, ` +
            `activation=${response.activation}, expiry=${response.expiry}`
        );

        return {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(response),
        };
    } catch (error: any) {
        context.error(`[Mock GetBaroActive] Error: ${error.message}`);
        return {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message }),
        };
    }
}

app.http("mockGetBaroActive", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: mockGetBaroActiveHttp,
});
