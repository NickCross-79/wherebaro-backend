/**
 * Manual trigger: report items stored more than once. Read-only — writes nothing.
 * Use it to see which items are duplicated (and which are showing a false NEW
 * badge) before deciding how to merge them.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { itemDuplicatesReportJob } from "../../jobs/itemDuplicatesReport.job";

export async function itemDuplicatesReportManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Item duplicates report requested at ${new Date().toISOString()}`);

    try {
        const result = await itemDuplicatesReportJob();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result, null, 2),
        };
    } catch (error) {
        context.error("[Manual] Item duplicates report failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Item duplicates report failed", details }),
        };
    }
}

app.http("itemDuplicatesReport", {
    methods: ["GET"],
    authLevel: "anonymous",
    handler: itemDuplicatesReportManualHttp,
});
