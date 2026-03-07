import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { voteJob, VotePayload } from "../../jobs/vote.job";

export async function voteItem(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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
        const payload: VotePayload = JSON.parse(body);

        if (!payload.item_oid || !payload.uid || !payload.voteType) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required fields: item_oid, uid, voteType" })
            };
        }

        if (payload.voteType !== "buy" && payload.voteType !== "skip") {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "voteType must be 'buy' or 'skip'" })
            };
        }

        const vote = await voteJob(payload);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: "Vote recorded successfully",
                vote
            })
        };
    } catch (error) {
        context.error(`Error recording vote: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to record vote", details: errorMessage })
        };
    }
}

app.http('voteItem', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: voteItem
});
