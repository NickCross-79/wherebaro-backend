import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function getMinVersion(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const minVersion = process.env.MIN_APP_VERSION || "1.0.0";

    return {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-cache, no-store, must-revalidate"
        },
        body: JSON.stringify({ minVersion })
    };
}

app.http('getMinVersion', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getMinVersion
});
