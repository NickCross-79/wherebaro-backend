import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getReviewsJob } from "../../jobs/getReviews.job";

export async function getReviews(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // Get item_id from query parameters or request body
        const itemId = request.query.get('item_id') || (await request.text() && JSON.parse(await request.text()).item_id);

        if (!itemId) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required parameter: item_id" })
            };
        }

        // Fetch reviews for the item
        const reviews = await getReviewsJob(itemId);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: "Reviews fetched successfully",
                reviews: reviews,
                count: reviews.length
            })
        };
    } catch (error) {
        context.error(`Error fetching reviews: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to fetch reviews", details: errorMessage })
        };
    }
};

app.http('getReviews', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: getReviews
});
