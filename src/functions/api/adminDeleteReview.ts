/**
 * Admin endpoint: deletes a review regardless of ownership (moderation action).
 * Requires admin API key.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ObjectId } from "mongodb";
import { adminDeleteReview } from "../../services/reviewService";
import { validateAdminApiKey } from "../../utils/auth";

function corsHeaders() {
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}

export async function adminDeleteReviewHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") {
        return { status: 204, headers: corsHeaders() };
    }

    const authHeader = request.headers.get("Authorization");
    if (!validateAdminApiKey(authHeader)) {
        context.warn(`[Admin] Unauthorized adminDeleteReview attempt`);
        return {
            status: 401,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Unauthorized", details: "Invalid or missing API key" }),
        };
    }

    try {
        const body = await request.text();
        const payload = JSON.parse(body || "{}");

        if (!payload.review_id || !ObjectId.isValid(payload.review_id)) {
            return {
                status: 400,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "Missing or invalid field: review_id" }),
            };
        }

        const deleted = await adminDeleteReview(new ObjectId(payload.review_id));
        if (!deleted) {
            return {
                status: 404,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "Review not found" }),
            };
        }

        return {
            status: 200,
            headers: corsHeaders(),
            body: JSON.stringify({ message: "Review deleted" }),
        };
    } catch (error) {
        context.error(`Error deleting review: ${error}`);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Failed to delete review", details }),
        };
    }
}

app.http("adminDeleteReview", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    handler: adminDeleteReviewHttp,
});
