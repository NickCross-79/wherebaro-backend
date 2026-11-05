/**
 * Tests that the push-token endpoints refuse to store anything that is not an
 * Expo push token, instead of finding out on Baro's next arrival.
 */
import { HttpRequest, InvocationContext } from "@azure/functions";

// The modules under test call app.http() at import time to register themselves.
jest.mock("@azure/functions", () => ({
  app: { http: jest.fn() },
}));

// expo-server-sdk ships as ESM, which Jest can't load here; mirror its token check.
jest.mock("expo-server-sdk", () => ({
  Expo: {
    isExpoPushToken: (token: unknown) =>
      typeof token === "string" && /^(Exponent|Expo)PushToken\[.+\]$/.test(token),
  },
}));

jest.mock("../../jobs/registerPushToken.job", () => ({
  registerPushTokenJob: jest.fn().mockResolvedValue({ id: "1" }),
}));

jest.mock("../../jobs/wishlistPushTokens.job", () => ({
  addWishlistPushTokenJob: jest.fn().mockResolvedValue(true),
  bulkSyncWishlistPushTokenJob: jest.fn().mockResolvedValue(2),
}));

import { registerPushToken } from "../../functions/api/registerPushToken";
import { addWishlistPushToken } from "../../functions/api/addWishlistPushToken";
import { bulkSyncWishlistPushToken } from "../../functions/api/bulkSyncWishlistPushToken";
import { registerPushTokenJob } from "../../jobs/registerPushToken.job";
import { addWishlistPushTokenJob, bulkSyncWishlistPushTokenJob } from "../../jobs/wishlistPushTokens.job";

const VALID = "ExponentPushToken[abc123]";
const INVALID = "not-a-push-token";
const ITEM = "64b7f0c2a1b2c3d4e5f60718";

function jsonRequest(body: unknown): HttpRequest {
  const text = JSON.stringify(body);
  return {
    url: "https://example.test/api",
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as InvocationContext;
}

describe("registerPushToken", () => {
  it("registers a valid Expo token", async () => {
    const response = await registerPushToken(jsonRequest({ token: VALID, deviceId: "d1" }), makeContext());

    expect(response.status).toBe(200);
    expect(registerPushTokenJob).toHaveBeenCalledWith(expect.objectContaining({ token: VALID }));
  });

  it("rejects a token that is not an Expo push token", async () => {
    const response = await registerPushToken(jsonRequest({ token: INVALID }), makeContext());

    expect(response.status).toBe(400);
    expect(registerPushTokenJob).not.toHaveBeenCalled();
  });
});

describe("addWishlistPushToken", () => {
  it("adds a valid token", async () => {
    const response = await addWishlistPushToken(jsonRequest({ item_oid: ITEM, pushToken: VALID }), makeContext());

    expect(response.status).toBe(200);
    expect(addWishlistPushTokenJob).toHaveBeenCalled();
  });

  it("still counts a wishlist add with no token (wishlist alerts off)", async () => {
    const response = await addWishlistPushToken(jsonRequest({ item_oid: ITEM, pushToken: null }), makeContext());

    expect(response.status).toBe(200);
    expect(addWishlistPushTokenJob).toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    const response = await addWishlistPushToken(jsonRequest({ item_oid: ITEM, pushToken: INVALID }), makeContext());

    expect(response.status).toBe(400);
    expect(addWishlistPushTokenJob).not.toHaveBeenCalled();
  });
});

describe("bulkSyncWishlistPushToken", () => {
  it("rejects adding an invalid token", async () => {
    const response = await bulkSyncWishlistPushToken(
      jsonRequest({ item_oids: [ITEM], pushToken: INVALID, action: "add" }),
      makeContext()
    );

    expect(response.status).toBe(400);
    expect(bulkSyncWishlistPushTokenJob).not.toHaveBeenCalled();
  });

  it("still allows removing a token, so a bad one already stored can be cleaned up", async () => {
    const response = await bulkSyncWishlistPushToken(
      jsonRequest({ item_oids: [ITEM], pushToken: INVALID, action: "remove" }),
      makeContext()
    );

    expect(response.status).toBe(200);
    expect(bulkSyncWishlistPushTokenJob).toHaveBeenCalled();
  });
});
