/**
 * Manual trigger for the Sunday Departing Soon scheduled job.
 * Checks if Baro is still active and sends a warning notification.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireAdminAuth } from "../../utils/auth";
import { baroDepartingSoonJob } from "../../jobs/baroDepartingSoon.job";

export async function baroDepartingSoonManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const denied = requireAdminAuth(request, context, "Baro departing soon");
    if (denied) return denied;

    context.log(`[Manual] Baro departing soon job triggered at ${new Date().toISOString()}`);

    try {
        const result = await baroDepartingSoonJob();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Baro departing soon job completed", result }),
        };
    } catch (error) {
        context.error("[Manual] Baro departing soon job failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Baro departing soon job failed", details }),
        };
    }
}

app.http("baroDepartingSoonManual", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: baroDepartingSoonManualHttp,
});
