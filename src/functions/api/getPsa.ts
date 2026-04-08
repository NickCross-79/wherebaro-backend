import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getPsaJob } from "../../jobs/getPsa.job";

export async function getPsa(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const psa = await getPsaJob();

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            },
            body: JSON.stringify(psa)
        };
    } catch (error) {
        context.error(`Error fetching PSA: ${error}`);
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Failed to fetch PSA" })
        };
    }
}

app.http('getPsa', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getPsa
});
