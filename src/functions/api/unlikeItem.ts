import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { unlikeJob, LikePayload } from "../../jobs/like.job";

export async function unlikeItem(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.text();
        const payload: LikePayload = JSON.parse(body);

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

        const removed = await unlikeJob(payload);

        if (!removed) {
            return {
                status: 404,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Like not found" })
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
                message: "Like removed successfully"
            })
        };
    } catch (error) {
        context.error(`Error removing like: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to remove like", details: errorMessage })
        };
    }
}

app.http('unlikeItem', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: unlikeItem
});
