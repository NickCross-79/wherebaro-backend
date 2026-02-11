import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { syncItemsJob } from "../../jobs/syncItems.job";

export async function syncItemsFromWiki(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);
    try {
        const result = await syncItemsJob();
        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify(result)
        };
    } catch (error) {
        context.error(`Error syncing items from wiki: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to sync items from wiki", details: errorMessage })
        };
    }
}

app.http('syncItems', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: syncItemsFromWiki
});
