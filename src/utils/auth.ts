/**
 * Authentication utilities for admin-only API endpoints.
 *
 * Admin endpoints are reachable on the public internet (`authLevel: "anonymous"`
 * so the Whenbaro Admin app does not need a Functions host key), which makes the
 * shared bearer token below the only thing standing between the internet and
 * jobs that mutate the `current` document and push notifications to every
 * registered device. Treat it accordingly: it is checked on every admin route,
 * it fails closed, and it is compared in constant time.
 */
import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { timingSafeEqual } from "crypto";

/**
 * Compares two strings without leaking their contents through timing.
 * Length differences are not hidden — only the byte comparison is constant time.
 */
function safeCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");

    if (bufferA.length !== bufferB.length) {
        return false;
    }

    return timingSafeEqual(bufferA, bufferB);
}

/** True when the server has an admin token configured to check against. */
export function isAdminApiKeyConfigured(): boolean {
    return !!process.env.ADMIN_API_KEY;
}

/**
 * Validates the API key from the Authorization header.
 * Expects format: "Bearer {apiKey}".
 *
 * Fails closed: with no `ADMIN_API_KEY` configured nothing can authenticate, so
 * a half-configured deployment refuses admin calls instead of serving them to
 * anyone who knows the route.
 *
 * @param authHeader The Authorization header value
 * @returns true if the API key is valid, false otherwise
 */
export function validateAdminApiKey(authHeader?: string | null): boolean {
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey || !authHeader) {
        return false;
    }

    // Extract the token from "Bearer {token}" format
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return false;
    }

    return safeCompare(parts[1], apiKey);
}

/**
 * Guard for admin-only HTTP endpoints.
 *
 * Returns a ready-to-return 401 response when the caller is not authenticated,
 * or `null` when the request may proceed:
 *
 * ```ts
 * const denied = requireAdminAuth(request, context, "Baro arrival");
 * if (denied) return denied;
 * ```
 *
 * @param label Human-readable operation name, used only for logging
 */
export function requireAdminAuth(
    request: HttpRequest,
    context: InvocationContext,
    label: string
): HttpResponseInit | null {
    if (validateAdminApiKey(request.headers.get("Authorization"))) {
        return null;
    }

    if (!isAdminApiKeyConfigured()) {
        context.error(
            `[Auth] ADMIN_API_KEY is not configured — refusing all ${label} requests. ` +
            `Set it in the Function App's application settings.`
        );
    } else {
        context.warn(`[Auth] Unauthorized ${label} request rejected`);
    }

    return {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized", details: "Invalid or missing API key" }),
    };
}
