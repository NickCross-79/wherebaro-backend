import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { removeVoteJob } from "../../jobs/vote.job";

export async function removeVote(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    if (request.method === "OPTIONS") {
        return {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        };
    }

    try {
        const body = await request.text();
        const payload = JSON.parse(body);

        if (!payload.item_oid || !payload.uid) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required fields: item_oid, uid" })
            };
        }

        const removed = await removeVoteJob({ item_oid: payload.item_oid, uid: payload.uid });

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: removed ? "Vote removed successfully" : "No vote found to remove",
                removed
            })
        };
    } catch (error) {
        context.error(`Error removing vote: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to remove vote", details: errorMessage })
        };
    }
}

app.http('removeVote', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: removeVote
});
