import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { removePushTokenJob } from "../../jobs/removePushToken.job";

export async function removePushToken(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.json() as { token?: string };

        if (!body?.token) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required parameter: token" })
            };
        }

        // Remove the push token
        await removePushTokenJob(body.token);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: "Push token removed successfully"
            })
        };
    } catch (error) {
        context.error(`Error removing push token: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to remove push token", details: errorMessage })
        };
    }
}

app.http('removePushToken', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: removePushToken
});
