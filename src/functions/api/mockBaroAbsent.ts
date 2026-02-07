import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase, db } from "../../db/database.service";

/**
 * DEV/TEST ONLY — Returns a warframestat.us-shaped response from the
 * `mockCurrent` collection (single document). Update the document in
 * MongoDB to change mock behavior without redeploying.
 * 
 * Use this to simulate a Baro arrival on the frontend:
 * 1. Point frontend's initial fetch at this endpoint
 * 2. Timer counts down, expires
 * 3. Frontend switches to real warframestat.us API — Baro is here
 * 4. Full arrival/polling flow triggers
 */
export async function mockBaroAbsent(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    try {
        await connectToDatabase();
        
        // Access the mockCurrent collection directly (not registered in collections map)
        const mockDoc = await db.collection("mockCurrent").findOne({});

        if (!mockDoc) {
            context.log("[Mock] No document found in mockCurrent collection");
            return {
                status: 404,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "No mock data found in mockCurrent collection" })
            };
        }

        // Strip the MongoDB _id before returning
        const { _id, ...response } = mockDoc;

        context.log(`[Mock] Returning mock data from DB. Activation: ${response.activation}, active: ${response.active}`);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(response)
        };
    } catch (error: any) {
        context.error(`[Mock] Error fetching mock data: ${error.message}`);
        return {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message })
        };
    }
}

app.http("mockBaroAbsent", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: mockBaroAbsent
});
