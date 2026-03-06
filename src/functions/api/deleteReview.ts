import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { deleteReviewJob, DeleteReviewPayload } from "../../jobs/deleteReview.job";

export async function deleteReview(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.text();
        const payload: DeleteReviewPayload = JSON.parse(body);

        if (!payload.review_id || !payload.uid) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required fields: review_id, uid" })
            };
        }

        const deleted = await deleteReviewJob(payload);

        if (!deleted) {
            return {
                status: 404,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Review not found or not authorized" })
            };
        }

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: "Review deleted successfully"
            })
        };
    } catch (error) {
        context.error(`Error deleting review: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to delete review", details: errorMessage })
        };
    }
}

app.http('deleteReview', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: deleteReview
});
