/**
 * Manual trigger: DEV/TEST ONLY — Returns a warframestat.us-shaped response
 * from the `mockCurrent` collection. Update the document in MongoDB to
 * change mock behavior without redeploying.
 *
 * Use this to simulate a Baro arrival on the frontend:
 * 1. Point frontend's initial fetch at this endpoint
 * 2. Timer counts down ARRIVAL_COUNTDOWN_SECONDS, expires
 * 3. Frontend polls mockGetCurrent until Baro is confirmed active
 * 4. Frontend fetches final inventory from mockGetBaroActive
 * 5. Full arrival flow completes using only mock data
 *
 * The activation/expiry dates are always overridden at runtime so the
 * countdown is predictable regardless of what is stored in the DB.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase, db } from "../../db/database.service";

/** Seconds from now until the simulated Baro arrival fires. */
const ARRIVAL_COUNTDOWN_SECONDS = 30;

export async function mockBaroAbsentHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Mock Absent] Triggered at ${new Date().toISOString()}`);

    try {
        await connectToDatabase();

        const mockDoc = await db.collection("mockCurrent").findOne({});

        if (!mockDoc) {
            context.log("[Mock Absent] No document found in mockCurrent collection");
            return {
                status: 404,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "No mock data found in mockCurrent collection" }),
            };
        }

        const { _id, activation: rawActivation, expiry: rawExpiry, isActive: _ignored, ...rest } = mockDoc as any;

        // Compute the original visit duration so expiry stays proportional
        const originalDurationMs =
            rawActivation && rawExpiry
                ? new Date(rawExpiry).getTime() - new Date(rawActivation).getTime()
                : 6 * 24 * 60 * 60 * 1000; // default: 6 days

        const now = new Date();
        const activation = new Date(now.getTime() + ARRIVAL_COUNTDOWN_SECONDS * 1000);
        const expiry = new Date(activation.getTime() + originalDurationMs);

        const response = {
            ...rest,
            isActive: false,
            activation: activation.toISOString(),
            expiry: expiry.toISOString(),
        };

        context.log(`[Mock Absent] Baro arrives in ${ARRIVAL_COUNTDOWN_SECONDS}s → activation=${response.activation}`);

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
