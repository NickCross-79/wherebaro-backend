import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { likeJob, LikePayload } from "../../jobs/like.job.js";

export async function likeItem(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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

        const like = await likeJob(payload);

        return {
            status: 201,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: "Like added successfully",
                like
            })
        };
    } catch (error) {
        context.error(`Error adding like: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorCode = (error as any)?.code;

        if (errorCode === 11000) {
            return {
                status: 409,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "User has already liked this item" })
            };
        }

        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to add like", details: errorMessage })
        };
    }
}

app.http('likeItem', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: likeItem
});
