import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAllItemsJob } from "../../jobs/getAllItems.job.js";

export async function getAllItems(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const items = await getAllItemsJob();

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify(items)
        };
    } catch (error) {
        context.error(`Error fetching baro items: ${error}`);
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Failed to fetch baro items" })
        };
    }
};

app.http('getAllItems', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: getAllItems
});
