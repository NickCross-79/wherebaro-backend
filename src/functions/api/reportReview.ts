import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { reportReviewJob, ReportReviewPayload } from "../../jobs/reportReview.job";

export async function reportReview(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.text();
        const payload: ReportReviewPayload = JSON.parse(body);

        if (!payload.review_id) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required field: review_id" })
            };
        }

        const reported = await reportReviewJob(payload);

        if (!reported) {
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
                message: "Review reported successfully"
            })
        };
    } catch (error) {
        context.error(`Error reporting review: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to report review", details: errorMessage })
        };
    }
}

app.http('reportReview', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: reportReview
});
