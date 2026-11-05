import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { withOwnership, viewerUidFrom } from "../../utils/ownership";
import { getLikesJob } from "../../jobs/getLikes.job";

export async function getLikes(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // Get item_id from query parameters or request body
        const bodyText = await request.text();
        const body = bodyText ? JSON.parse(bodyText) : {};
        const itemId = request.query.get('item_id') || body.item_id;
        // The viewer's own uid comes in the POST body (never the URL, which is
        // logged) and is only used to mark which entries are theirs.
        const viewerUid = viewerUidFrom(body);

        if (!itemId) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required parameter: item_id" })
            };
        }

        // Fetch likes for the item
        const likes = await getLikesJob(itemId);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            },
            body: JSON.stringify({
                message: "Likes fetched successfully",
                likes: withOwnership(likes, viewerUid),
                count: likes.length
            })
        };
    } catch (error) {
        context.error(`Error fetching likes: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to fetch likes", details: errorMessage })
        };
    }
};

app.http('getLikes', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: getLikes
});
