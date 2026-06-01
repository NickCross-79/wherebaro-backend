/**
 * Manual trigger for the Wednesday wiki sync scheduled job.
 * Scrapes the Warframe wiki and syncs item data into the database.
 * Requires authentication via API key in Authorization header.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { syncItemsJob } from "../../jobs/syncItems.job";
import { validateAdminApiKey } from "../../utils/auth";

export async function syncItemsManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    // Validate admin API key authentication
    const authHeader = request.headers.get("Authorization");
    if (!validateAdminApiKey(authHeader)) {
        context.warn(`[Manual] Unauthorized sync items request attempt`);
        return {
            status: 401,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Unauthorized", details: "Invalid or missing API key" }),
        };
    }

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
