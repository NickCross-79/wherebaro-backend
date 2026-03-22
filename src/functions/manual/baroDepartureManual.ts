/**
 * Manual trigger for the Sunday Departure scheduled job.
 * Checks if Baro just left, updates the DB, and sends a departure notification.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { baroDepartureJob } from "../../jobs/baroDeparture.job";

export async function baroDepartureManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Baro departure job triggered at ${new Date().toISOString()}`);

    try {
        const result = await baroDepartureJob();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Baro departure job completed", result }),
        };
    } catch (error) {
        context.error("[Manual] Baro departure job failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Baro departure job failed", details }),
        };
    }
}

app.http("baroDepartureManual", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: baroDepartureManualHttp,
});
