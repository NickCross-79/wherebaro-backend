import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { seedDB } from "../../jobs/seedDB.job.js";

export async function seedDBFunction(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        await seedDB();

        return {
            status: 201,
            body: JSON.stringify({
                message: "Document inserted successfully"
            })
        };
    } catch (error) {
        context.error(`Error inserting document: ${error}`);
        return {
            status: 500,
            body: JSON.stringify({ error: "Failed to insert document" })
        };
    }
};

app.http('seedDBFunction', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: seedDBFunction
});
