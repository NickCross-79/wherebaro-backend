import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { collections, connectToDatabase } from "../../db/database.service.js";
import { ObjectId } from "mongodb";
import BaroItem from "../../models/baroItem.js";

export async function testTrigger(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // Ensure database connection
        if (!collections.baroItems) {
            await connectToDatabase();
        }

        // Create a sample baro item document
        const newBaroItem = new BaroItem(
            "Test Game",
            "test-game",
            "https://example.com/image.jpg",
            "https://example.com",
            100,
            50,
            "Free",
            ["2026-01-28"],
            0,
            []
        );

        // Insert the document
        const result = await collections.baroItems!.insertOne(newBaroItem);

        return {
            status: 201,
            body: JSON.stringify({
                message: "Document inserted successfully",
                insertedId: result.insertedId
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

app.http('testTrigger', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: testTrigger
});
