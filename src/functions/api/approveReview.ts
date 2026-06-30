/**
 * Admin endpoint: approves a reported review by clearing its report count.
 * Requires admin API key.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ObjectId } from "mongodb";
import { approveReview } from "../../services/reviewService";
import { validateAdminApiKey } from "../../utils/auth";

function corsHeaders() {
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
}

export async function approveReviewHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") {
        return { status: 204, headers: corsHeaders() };
    }

    const authHeader = request.headers.get("Authorization");
    if (!validateAdminApiKey(authHeader)) {
        context.warn(`[Admin] Unauthorized approveReview attempt`);
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

        const approved = await approveReview(new ObjectId(payload.review_id));
        if (!approved) {
            return {
                status: 404,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "Review not found" }),
            };
        }

        return {
            status: 200,
            headers: corsHeaders(),
            body: JSON.stringify({ message: "Review approved" }),
        };
    } catch (error) {
        context.error(`Error approving review: ${error}`);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Failed to approve review", details }),
        };
    }
}

app.http("approveReview", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    handler: approveReviewHttp,
});
