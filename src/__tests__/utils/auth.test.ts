/**
 * Tests for the admin auth util — the only thing guarding the admin routes.
 */
import { HttpRequest, InvocationContext } from "@azure/functions";
import { isAdminApiKeyConfigured, requireAdminAuth, validateAdminApiKey } from "../../utils/auth";

const VALID_KEY = "super-secret-admin-key";

const originalKey = process.env.ADMIN_API_KEY;

afterAll(() => {
  if (originalKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = originalKey;
});

function makeRequest(authHeader?: string): HttpRequest {
  return {
    headers: { get: (name: string) => (name === "Authorization" ? authHeader ?? null : null) },
  } as unknown as HttpRequest;
}

function makeContext() {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as InvocationContext & {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
  };
}

describe("validateAdminApiKey", () => {
  describe("with a key configured", () => {
    beforeEach(() => {
      process.env.ADMIN_API_KEY = VALID_KEY;
    });

    it("accepts the matching bearer token", () => {
      expect(validateAdminApiKey(`Bearer ${VALID_KEY}`)).toBe(true);
    });

    it("rejects a wrong token of the same length", () => {
      expect(validateAdminApiKey(`Bearer ${"x".repeat(VALID_KEY.length)}`)).toBe(false);
    });

    it("rejects a token that is only a prefix of the real key", () => {
      expect(validateAdminApiKey(`Bearer ${VALID_KEY.slice(0, -1)}`)).toBe(false);
    });

    it("rejects a missing header", () => {
      expect(validateAdminApiKey(undefined)).toBe(false);
      expect(validateAdminApiKey(null)).toBe(false);
      expect(validateAdminApiKey("")).toBe(false);
    });

    it("rejects a bare token without the Bearer scheme", () => {
      expect(validateAdminApiKey(VALID_KEY)).toBe(false);
    });

    it("rejects a different auth scheme", () => {
      expect(validateAdminApiKey(`Basic ${VALID_KEY}`)).toBe(false);
      expect(validateAdminApiKey(`bearer ${VALID_KEY}`)).toBe(false);
    });

    it("rejects a malformed header with extra parts", () => {
      expect(validateAdminApiKey(`Bearer ${VALID_KEY} extra`)).toBe(false);
    });
  });

  describe("with no key configured", () => {
    beforeEach(() => {
      delete process.env.ADMIN_API_KEY;
    });

    it("fails closed rather than letting everything through", () => {
      expect(validateAdminApiKey(`Bearer ${VALID_KEY}`)).toBe(false);
      expect(validateAdminApiKey(undefined)).toBe(false);
    });

    it("reports that no key is configured", () => {
      expect(isAdminApiKeyConfigured()).toBe(false);
      process.env.ADMIN_API_KEY = VALID_KEY;
      expect(isAdminApiKeyConfigured()).toBe(true);
    });
  });
});

describe("requireAdminAuth", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = VALID_KEY;
  });

  it("returns null so the handler proceeds when authenticated", () => {
    const context = makeContext();
    expect(requireAdminAuth(makeRequest(`Bearer ${VALID_KEY}`), context, "test op")).toBeNull();
    expect(context.warn).not.toHaveBeenCalled();
    expect(context.error).not.toHaveBeenCalled();
  });

  it("returns a 401 JSON response for a bad key and logs a warning", () => {
    const context = makeContext();
    const denied = requireAdminAuth(makeRequest("Bearer nope"), context, "test op");

    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
    expect(JSON.parse(denied!.body as string)).toEqual({
      error: "Unauthorized",
      details: "Invalid or missing API key",
    });
    expect(context.warn).toHaveBeenCalledWith(expect.stringContaining("test op"));
  });

  it("logs an actionable error when the server has no key configured", () => {
    delete process.env.ADMIN_API_KEY;
    const context = makeContext();
    const denied = requireAdminAuth(makeRequest(`Bearer ${VALID_KEY}`), context, "test op");

    expect(denied!.status).toBe(401);
    expect(context.error).toHaveBeenCalledWith(expect.stringContaining("ADMIN_API_KEY is not configured"));
  });

  it("never echoes the expected key back to the caller", () => {
    const context = makeContext();
    const denied = requireAdminAuth(makeRequest("Bearer nope"), context, "test op");
    expect(denied!.body as string).not.toContain(VALID_KEY);
  });
});
