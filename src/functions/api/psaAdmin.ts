/**
 * Admin endpoints for managing PSA messages / alerts (the `psa` collection).
 * All routes require the admin API key.
 *
 *   GET  getAllPsa     — list every PSA (active + inactive)
 *   POST createPsa     — { title, message, isActive? }
 *   POST updatePsa     — { _id, title?, message?, isActive? }
 *   POST deletePsa     — { _id }
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
    fetchAllPsa,
    createPsa,
    updatePsa,
    deletePsa,
} from "../../services/psaService";
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

function unauthorized() {
    return {
        status: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: "Unauthorized", details: "Invalid or missing API key" }),
    };
}

function isAuthorized(request: HttpRequest): boolean {
    return validateAdminApiKey(request.headers.get("Authorization"));
}

function fail(context: InvocationContext, label: string, error: unknown): HttpResponseInit {
    context.error(`${label}: ${error}`);
    const details = error instanceof Error ? error.message : "Unknown error";
    return {
        status: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: label, details }),
    };
}

export async function getAllPsaHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders() };
    if (!isAuthorized(request)) return unauthorized();

    try {
        const psas = await fetchAllPsa();
        return { status: 200, headers: corsHeaders(), body: JSON.stringify({ psas }) };
    } catch (error) {
        return fail(context, "Failed to fetch PSAs", error);
    }
}

export async function createPsaHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders() };
    if (!isAuthorized(request)) return unauthorized();

    try {
        const payload = JSON.parse((await request.text()) || "{}");
        if (!payload.title || !payload.message) {
            return {
                status: 400,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "Missing required fields: title, message" }),
            };
        }
        const psa = await createPsa({
            title: payload.title,
            message: payload.message,
            isActive: payload.isActive,
        });
        return { status: 201, headers: corsHeaders(), body: JSON.stringify({ psa }) };
    } catch (error) {
        return fail(context, "Failed to create PSA", error);
    }
}

export async function updatePsaHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders() };
    if (!isAuthorized(request)) return unauthorized();

    try {
        const payload = JSON.parse((await request.text()) || "{}");
        if (!payload._id) {
            return {
                status: 400,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "Missing required field: _id" }),
            };
        }
        const psa = await updatePsa(payload._id, {
            title: payload.title,
            message: payload.message,
            isActive: payload.isActive,
        });
        if (!psa) {
            return { status: 404, headers: corsHeaders(), body: JSON.stringify({ error: "PSA not found" }) };
        }
        return { status: 200, headers: corsHeaders(), body: JSON.stringify({ psa }) };
    } catch (error) {
        return fail(context, "Failed to update PSA", error);
    }
}

export async function deletePsaHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    if (request.method === "OPTIONS") return { status: 204, headers: corsHeaders() };
    if (!isAuthorized(request)) return unauthorized();

    try {
        const payload = JSON.parse((await request.text()) || "{}");
        if (!payload._id) {
            return {
                status: 400,
                headers: corsHeaders(),
                body: JSON.stringify({ error: "Missing required field: _id" }),
            };
        }
        const deleted = await deletePsa(payload._id);
        if (!deleted) {
            return { status: 404, headers: corsHeaders(), body: JSON.stringify({ error: "PSA not found" }) };
        }
        return { status: 200, headers: corsHeaders(), body: JSON.stringify({ message: "PSA deleted" }) };
    } catch (error) {
        return fail(context, "Failed to delete PSA", error);
    }
}

app.http("getAllPsa", { methods: ["GET", "OPTIONS"], authLevel: "anonymous", handler: getAllPsaHttp });
app.http("createPsa", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", handler: createPsaHttp });
app.http("updatePsa", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", handler: updatePsaHttp });
app.http("deletePsa", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", handler: deletePsaHttp });
