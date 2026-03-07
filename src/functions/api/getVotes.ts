import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getVotesJob } from "../../jobs/vote.job";

export async function getVotes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    if (request.method === "OPTIONS") {
        return {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        };
    }

    try {
        const bodyText = await request.text();
        const itemId = request.query.get('item_id') || (bodyText ? JSON.parse(bodyText).item_id : undefined);

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

        const result = await getVotesJob(itemId);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            },
            body: JSON.stringify({
                message: "Votes fetched successfully",
                buyCount: result.buyCount,
                skipCount: result.skipCount,
                votes: result.votes
            })
        };
    } catch (error) {
        context.error(`Error fetching votes: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to fetch votes", details: errorMessage })
        };
    }
}

app.http('getVotes', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: getVotes
});
