import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

/**
 * DEV/TEST ONLY — Returns a warframestat.us-shaped response as if Baro is absent,
 * with activation set to `delaySeconds` from now (default 60s).
 * 
 * Use this to simulate a Baro arrival on the frontend:
 * 1. Point frontend's initial fetch at this endpoint
 * 2. Timer counts down, expires
 * 3. Frontend switches to real warframestat.us API — Baro is here
 * 4. Full arrival/polling flow triggers
 * 
 * Query params:
 *   ?delaySeconds=60  — seconds until Baro "arrives" (default 60)
 */
export async function mockBaroAbsent(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    // Hardcoded: Baro arrives at 3:40 PM EST (8:40 PM UTC) on Feb 7, 2026
    const activation = "2026-02-07T20:40:00.000Z";
    const expiry = "2026-02-09T20:40:00.000Z"; // 48h after activation

    const response = {
        id: "5d1e07a0a38e4a4fdd7cefca",
        activation,
        expiry,
        active: false,
        character: "Baro Ki'Teer",
        location: "Strata Relay (Earth)",
        inventory: [],
        psId: "5d1e07a0a38e4a4fdd7cefca30",
        initialStart: "1970-01-01T00:00:00.000Z",
        schedule: []
    };

    context.log(`[Mock] Returning Baro absent response. Activation: ${activation}`);

    return {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(response)
    };
}

app.http("mockBaroAbsent", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: mockBaroAbsent
});
