/**
 * Manual trigger: Seed the database with wiki-scraped Baro items.
 *
 * Admin only, POST only. Seeding inserts every scraped item without checking
 * for existing ones, so each call duplicates the whole item list; it must
 * never be reachable without the key, or by a crawler following a GET link.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { seedDB } from "../../jobs/seedDB.job";
import { requireAdminAuth } from "../../utils/auth";

export async function seedDBManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const denied = requireAdminAuth(request, context, "seed DB");
    if (denied) return denied;

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
    methods: ["POST"],
    authLevel: "anonymous",
    handler: seedDBManualHttp,
});
