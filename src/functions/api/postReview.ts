import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { postReviewJob, ReviewPayload } from "../../jobs/postReview.job";

export async function postReview(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // Parse the request body
        const body = await request.text();
        const reviewPayload: ReviewPayload = JSON.parse(body);

        // Validate required fields
        if (!reviewPayload.item_oid || !reviewPayload.user || !reviewPayload.content || !reviewPayload.date || !reviewPayload.uid) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required fields: item_oid, user, content, date, uid" })
            };
        }

        // Post the review
        const postedReview = await postReviewJob(reviewPayload);

        return {
            status: 201,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: "Review posted successfully",
                review: postedReview
            })
        };
    } catch (error) {
        context.error(`Error posting review: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorCode = (error as any)?.code;

        if (errorCode === "REVIEW_EXISTS" || errorCode === 11000) {
            return {
                status: 409,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "User has already reviewed this item" })
            };
        }

        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to post review", details: errorMessage })
        };
    }
};

app.http('postReview', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: postReview
});
