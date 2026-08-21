/**
 * Manual trigger for the Baro reconcile safety-net job.
 * Repairs the `current` document if it disagrees with the live Baro data, and
 * sends the arrival notification if this cycle never got one.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { baroReconcileJob } from "../../jobs/baroReconcile.job";

export async function baroReconcileManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Baro reconcile triggered at ${new Date().toISOString()}`);

    try {
        const result = await baroReconcileJob();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Baro reconcile completed", result }),
        };
    } catch (error) {
        context.error("[Manual] Baro reconcile failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Baro reconcile failed", details }),
        };
    }
}

app.http("baroReconcileManual", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: baroReconcileManualHttp,
});
