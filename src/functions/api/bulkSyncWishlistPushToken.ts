import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { bulkSyncWishlistPushTokenJob, BulkWishlistSyncPayload } from "../../jobs/wishlistPushTokens.job";

export async function bulkSyncWishlistPushToken(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.text();
        const payload: BulkWishlistSyncPayload = JSON.parse(body);

        if (!payload.item_oids || !Array.isArray(payload.item_oids) || !payload.pushToken || !payload.action) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required fields: item_oids (array), pushToken, action ('add' | 'remove')" })
            };
        }

        if (payload.action !== 'add' && payload.action !== 'remove') {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "action must be 'add' or 'remove'" })
            };
        }

        const updatedCount = await bulkSyncWishlistPushTokenJob(payload);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({ message: `Push token ${payload.action === 'add' ? 'added to' : 'removed from'} ${updatedCount} item(s)`, updatedCount })
        };
    } catch (error) {
        context.error(`Error bulk syncing wishlist push tokens: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to bulk sync wishlist push tokens", details: errorMessage })
        };
    }
}

app.http('bulkSyncWishlistPushToken', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: bulkSyncWishlistPushToken
});
