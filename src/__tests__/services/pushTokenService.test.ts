/**
 * Tests for pushTokenService
 */
import { ObjectId } from "mongodb";
import {
  registerPushToken,
  getActivePushTokens,
  deactivatePushToken,
  removePushToken,
  cleanupInactiveTokens,
} from "../../services/pushTokenService";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupPushTokensCollection(overrides: Record<string, jest.Mock> = {}) {
  mockCollections.pushTokens = {
    findOne: jest.fn().mockResolvedValue(null),
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
    ...overrides,
  };
  return mockCollections.pushTokens;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("pushTokenService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.pushTokens;
  });

  // ── registerPushToken ──────────────────────────────────────────────────────

  describe("registerPushToken", () => {
    it("creates new token when it does not exist", async () => {
      const insertedId = new ObjectId();
      setupPushTokensCollection({
        insertOne: jest.fn().mockResolvedValue({ insertedId }),
      });

      const result = await registerPushToken({ token: "ExponentPushToken[abc123]", deviceId: "device-1" });

      expect(result.token).toBe("ExponentPushToken[abc123]");
      expect(result.deviceId).toBe("device-1");
      expect(result.isActive).toBe(true);
      expect(mockCollections.pushTokens.insertOne).toHaveBeenCalled();
    });

    it("updates existing token when it already exists", async () => {
      const existingId = new ObjectId();
      setupPushTokensCollection({
        findOne: jest.fn().mockResolvedValue({
          _id: existingId,
          token: "ExponentPushToken[abc123]",
          deviceId: "device-1",
          createdAt: new Date("2025-01-01"),
        }),
      });

      const result = await registerPushToken({ token: "ExponentPushToken[abc123]" });

      expect(result.id).toBe(existingId.toString());
      expect(result.isActive).toBe(true);
      expect(mockCollections.pushTokens.updateOne).toHaveBeenCalledWith(
        { token: "ExponentPushToken[abc123]" },
        { $set: { lastUsed: expect.any(Date), isActive: true } }
      );
    });
  });

  // ── getActivePushTokens ────────────────────────────────────────────────────

  describe("getActivePushTokens", () => {
    it("returns array of active token strings", async () => {
      setupPushTokensCollection({
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { token: "token-1", isActive: true },
            { token: "token-2", isActive: true },
          ]),
        }),
      });

      const result = await getActivePushTokens();

      expect(result).toEqual(["token-1", "token-2"]);
      expect(mockCollections.pushTokens.find).toHaveBeenCalledWith({ isActive: true });
    });

    it("returns empty array when no active tokens", async () => {
      setupPushTokensCollection();
      const result = await getActivePushTokens();
      expect(result).toEqual([]);
    });

    it("returns empty array when pushTokens collection is undefined", async () => {
      mockCollections.pushTokens = undefined;
      const result = await getActivePushTokens();
      expect(result).toEqual([]);
    });
  });

  // ── deactivatePushToken ────────────────────────────────────────────────────

  describe("deactivatePushToken", () => {
    it("sets isActive to false for the given token", async () => {
      setupPushTokensCollection();
      await deactivatePushToken("ExponentPushToken[abc123]");

      expect(mockCollections.pushTokens.updateOne).toHaveBeenCalledWith(
        { token: "ExponentPushToken[abc123]" },
        { $set: { isActive: false } }
      );
    });
  });

  // ── removePushToken ────────────────────────────────────────────────────────

  describe("removePushToken", () => {
    it("deletes the token document", async () => {
      setupPushTokensCollection();
      await removePushToken("ExponentPushToken[abc123]");

      expect(mockCollections.pushTokens.deleteOne).toHaveBeenCalledWith({
        token: "ExponentPushToken[abc123]",
      });
    });
  });

  // ── cleanupInactiveTokens ──────────────────────────────────────────────────

  describe("cleanupInactiveTokens", () => {
    it("deletes inactive tokens older than 90 days", async () => {
      setupPushTokensCollection({
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 5 }),
      });

      const result = await cleanupInactiveTokens();

      expect(result).toBe(5);
      expect(mockCollections.pushTokens.deleteMany).toHaveBeenCalledWith({
        isActive: false,
        lastUsed: { $lt: expect.any(Date) },
      });
    });

    it("returns 0 when no tokens to clean up", async () => {
      setupPushTokensCollection();
      const result = await cleanupInactiveTokens();
      expect(result).toBe(0);
    });
  });
});
