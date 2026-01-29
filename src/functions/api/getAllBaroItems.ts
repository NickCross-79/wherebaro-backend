import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getAllBaroItemsJob } from "../../jobs/getAllBaroItems.job.js";

export async function getAllBaroItems(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const items = await getAllBaroItemsJob();

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json"
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

app.http('getAllBaroItems', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: getAllBaroItems
});
