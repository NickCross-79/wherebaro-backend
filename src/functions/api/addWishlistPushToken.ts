import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { addWishlistPushTokenJob, WishlistPushTokenPayload } from "../../jobs/wishlistPushTokens.job";

export async function addWishlistPushToken(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.text();
        const payload: WishlistPushTokenPayload = JSON.parse(body);

        if (!payload.item_oid || !payload.pushToken) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required fields: item_oid, pushToken" })
            };
        }

        await addWishlistPushTokenJob(payload);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({ message: "Push token added to item wishlist" })
        };
    } catch (error) {
        context.error(`Error adding wishlist push token: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to add wishlist push token", details: errorMessage })
        };
    }
}

app.http('addWishlistPushToken', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: addWishlistPushToken
});
