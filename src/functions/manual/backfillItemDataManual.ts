/**
 * Manual trigger to backfill missing uniqueName and cdnImageLink fields on all items.
 * Safe to call at any time without re-seeding the database.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { backfillItemData } from "../../services/itemService";

export async function backfillItemDataManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Backfill item data triggered at ${new Date().toISOString()}`);

    try {
        const result = await backfillItemData();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Backfill item data completed", result }),
        };
    } catch (error) {
        context.error("[Manual] Backfill item data failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Backfill item data failed", details }),
        };
    }
}

app.http("backfillItemData", {
    methods: ["GET", "POST"],
    authLevel: "function",
    handler: backfillItemDataManualHttp,
});
