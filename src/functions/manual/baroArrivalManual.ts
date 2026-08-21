/**
 * Manual trigger for the Friday Baro Arrival scheduled job.
 * Runs the full flow: API health check → inventory resolution → DB update → notifications.
 *
 * Admin only: requires the API key in the Authorization header. Triggered from
 * the Whenbaro Admin app. This job pushes a notification to every registered
 * device, so it must never be reachable without the key.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { baroArrivalJob } from "../../jobs/baroArrival.job";
import { requireAdminAuth } from "../../utils/auth";

export async function baroArrivalManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const denied = requireAdminAuth(request, context, "Baro arrival");
    if (denied) return denied;

    context.log(`[Manual] Baro arrival job triggered at ${new Date().toISOString()}`);

    try {
        const result = await baroArrivalJob();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Baro arrival job completed", result }),
        };
    } catch (error) {
        context.error("[Manual] Baro arrival job failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Baro arrival job failed", details }),
        };
    }
}

app.http("baroArrivalManual", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: baroArrivalManualHttp,
});
