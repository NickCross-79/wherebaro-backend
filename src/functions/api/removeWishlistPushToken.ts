import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { removeWishlistPushTokenJob, WishlistPushTokenPayload } from "../../jobs/wishlistPushTokens.job";

export async function removeWishlistPushToken(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const body = await request.text();
        const payload: WishlistPushTokenPayload = JSON.parse(body);

        if (!payload.item_oid) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Missing required field: item_oid" })
            };
        }

        await removeWishlistPushTokenJob(payload);

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({ message: "Push token removed from item wishlist" })
        };
    } catch (error) {
        context.error(`Error removing wishlist push token: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: "Failed to remove wishlist push token", details: errorMessage })
        };
    }
}

app.http('removeWishlistPushToken', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: removeWishlistPushToken
});
