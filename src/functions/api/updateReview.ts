import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { updateReviewJob, UpdateReviewPayload } from "../../jobs/updateReview.job";

export async function updateReview(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.text();
        const payload: UpdateReviewPayload = JSON.parse(body);

        if (!payload.review_id || !payload.uid || !payload.content || !payload.date || !payload.time) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required fields: review_id, uid, content, date, time" })
            };
        }

        const updated = await updateReviewJob(payload);

        if (!updated) {
            return {
                status: 404,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Review not found" })
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
                message: "Review updated successfully",
                review: updated
            })
        };
    } catch (error) {
        context.error(`Error updating review: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to update review", details: errorMessage })
        };
    }
}

app.http('updateReview', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: updateReview
});
