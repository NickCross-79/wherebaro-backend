/**
 * Admin endpoint: returns everything linked to a device id (uid) — push token
 * registrations, reviews, likes, votes, and wishlisted items. Requires admin key.
 *
 * Accepts the device id via ?deviceId= query (GET) or { deviceId } body (POST).
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getDeviceProfile } from "../../services/deviceLookupService";
import { validateAdminApiKey } from "../../utils/auth";

function corsHeaders() {
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Cache-Control": "no-cache, no-store, must-revalidate",
    };
}

export async function getDeviceProfileHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") {
        return { status: 204, headers: corsHeaders() };
    }

    if (!validateAdminApiKey(request.headers.get("Authorization"))) {
        context.warn(`[Admin] Unauthorized getDeviceProfile attempt`);
        return {
            status: 401,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Unauthorized", details: "Invalid or missing API key" }),
        };
    }

    try {
        let deviceId = request.query.get("deviceId") ?? "";
        if (!deviceId && request.method === "POST") {
            const body = JSON.parse((await request.text()) || "{}");
            deviceId = body.deviceId ?? "";
        }

        if (!deviceId.trim()) {
            return {
                status: 400,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "Missing required field: deviceId" }),
            };
        }

        const profile = await getDeviceProfile(deviceId);
        return { status: 200, headers: corsHeaders(), body: JSON.stringify(profile) };
    } catch (error) {
        context.error(`Error fetching device profile: ${error}`);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: "Failed to fetch device profile", details }),
        };
    }
}

app.http("getDeviceProfile", {
    methods: ["GET", "POST", "OPTIONS"],
    authLevel: "anonymous",
    handler: getDeviceProfileHttp,
});
