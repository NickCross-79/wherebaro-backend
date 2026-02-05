import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { registerPushTokenJob } from "../../jobs/registerPushToken.job";

export async function registerPushToken(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.json() as { token?: string; deviceId?: string };

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

        // Register the push token
        const result = await registerPushTokenJob({ 
            token: body.token,
            deviceId: body.deviceId 
        });

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({
                message: "Push token registered successfully",
                token: result
            })
        };
    } catch (error) {
        context.error(`Error registering push token: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to register push token", details: errorMessage })
        };
    }
}

app.http('registerPushToken', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: registerPushToken
});
