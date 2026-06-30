/**
 * Admin endpoint: lists all reviews that have been reported, enriched with the
 * name of the item they belong to. Requires admin API key.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getReportedReviews } from "../../services/reviewService";
import { validateAdminApiKey } from "../../utils/auth";

export async function getReportedReviewsHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") {
        return { status: 204, headers: corsHeaders() };
    }

    const authHeader = request.headers.get("Authorization");
    if (!validateAdminApiKey(authHeader)) {
        context.warn(`[Admin] Unauthorized getReportedReviews attempt`);
        return {
            status: 401,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Unauthorized", details: "Invalid or missing API key" }),
        };
    }

    try {
        const reviews = await getReportedReviews();
        return {
            status: 200,
            headers: corsHeaders(),
            body: JSON.stringify({ reviews }),
        };
    } catch (error) {
        context.error(`Error fetching reported reviews: ${error}`);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Failed to fetch reported reviews", details }),
        };
    }
}

function corsHeaders() {
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Cache-Control": "no-cache, no-store, must-revalidate",
    };
}

app.http("getReportedReviews", {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    handler: getReportedReviewsHttp,
});
