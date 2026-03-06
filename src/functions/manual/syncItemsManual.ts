/**
 * Manual trigger for the Wednesday wiki sync scheduled job.
 * Scrapes the Warframe wiki and syncs item data into the database.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { syncItemsJob } from "../../jobs/syncItems.job";

export async function syncItemsManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Sync items job triggered at ${new Date().toISOString()}`);

    try {
        const result = await syncItemsJob();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Sync items job completed", result }),
        };
    } catch (error) {
        context.error("[Manual] Sync items job failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Sync items job failed", details }),
        };
    }
}

app.http("syncItemsManual", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: syncItemsManualHttp,
});
