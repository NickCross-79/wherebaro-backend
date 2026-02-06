import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { backfillUniqueNames } from "../../jobs/backfillUniqueNames.job";

export async function backfillUniqueNamesFunction(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const result = await backfillUniqueNames();

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                message: "Backfill complete",
                ...result
            })
        };
    } catch (error) {
        context.error(`Error in backfill: ${error}`);
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Failed to backfill unique names" })
        };
    }
}

app.http("backfillUniqueNames", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: backfillUniqueNamesFunction
});
