/**
 * Manual trigger: DEV/TEST ONLY — Returns a getCurrent-shaped response
 * drawn from the `mockCurrent` collection, with Baro marked as active.
 *
 * Used by the frontend during arrival simulation to replace the real
 * `getCurrent` poll after the countdown timer fires, so the poll loop
 * sees `isActive: true` and signals the frontend that Baro has arrived.
 *
 * Response shape mirrors the real getCurrent endpoint:
 *   { isActive, activation, expiry, location, items }
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase, db } from "../../db/database.service";

export async function mockGetCurrentHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Mock GetCurrent] Triggered at ${new Date().toISOString()}`);

    try {
        await connectToDatabase();

        const mockDoc = await db.collection("mockCurrent").findOne({});

        if (!mockDoc) {
            context.log("[Mock GetCurrent] No document found in mockCurrent collection");
            return {
                status: 404,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "No mock data found in mockCurrent collection" }),
            };
        }

        const { _id, inventory, isActive: _ignored, ...rest } = mockDoc as any;

        // Always report Baro as active — this endpoint is only called after
        // the arrival countdown fires, so we always confirm he has arrived.
        const response = {
            ...rest,
            isActive: true,
            // items is empty here: the frontend fetches inventory separately
            // via fetchBaroDataWithFallback → mockGetBaroActive
            items: [],
        };

        context.log(`[Mock GetCurrent] Returning isActive=true, location="${response.location}"`);

        return {
            status: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(response),
        };
    } catch (error: any) {
        context.error(`[Mock GetCurrent] Error: ${error.message}`);
        return {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message }),
        };
    }
}

app.http("mockGetCurrent", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: mockGetCurrentHttp,
});
