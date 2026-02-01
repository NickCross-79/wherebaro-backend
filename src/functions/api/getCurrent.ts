import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getCurrentJob } from "../../jobs/getCurrent.job.js";

export async function getCurrent(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const baroData = await getCurrentJob();

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify(baroData)
        };
    } catch (error) {
        context.error(`Error fetching current baro data: ${error}`);
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Failed to fetch current baro data" })
        };
    }
};

app.http('getCurrent', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: getCurrent
});
