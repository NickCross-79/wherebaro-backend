/**
 * Manual trigger: re-resolve Baro's inventory into the `current` document
 * WITHOUT sending any notifications.
 *
 * For fixing an incomplete manifest mid-visit — e.g. after updating
 * @wfcd/items so a new item can finally be resolved — when users have already
 * received the arrival notification for this visit.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { baroResyncInventoryJob } from "../../jobs/baroResyncInventory.job";

export async function baroResyncInventoryManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Baro inventory resync triggered at ${new Date().toISOString()}`);

    try {
        const result = await baroResyncInventoryJob();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Baro inventory resync completed", result }),
        };
    } catch (error) {
        context.error("[Manual] Baro inventory resync failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Baro inventory resync failed", details }),
        };
    }
}

app.http("baroResyncInventory", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: baroResyncInventoryManualHttp,
});
