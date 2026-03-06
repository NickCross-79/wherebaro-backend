/**
 * Manual trigger: Seed the database with wiki-scraped Baro items.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { seedDB } from "../../jobs/seedDB.job";

export async function seedDBManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Seed DB triggered at ${new Date().toISOString()}`);

    try {
        const backfillResult = await seedDB();
        return {
            status: 201,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "Database seeded and unique names backfilled",
                backfill: backfillResult,
            }),
        };
    } catch (error) {
        context.error("[Manual] Seed DB failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Failed to seed database", details }),
        };
    }
}

app.http("seedDBFunction", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: seedDBManualHttp,
});
