import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Expo } from "expo-server-sdk";
import { addWishlistPushTokenJob, WishlistPushTokenPayload } from "../../jobs/wishlistPushTokens.job";

export async function addWishlistPushToken(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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

        // Only a valid Expo token is worth storing on items; removing one is
        // always allowed so a bad token already stored can still be cleaned up.
        if (payload.pushToken && !Expo.isExpoPushToken(payload.pushToken)) {
            return {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: JSON.stringify({ error: "Invalid Expo push token" })
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
