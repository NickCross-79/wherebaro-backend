/**
 * Tests for wishlistService
 */
import { ObjectId } from "mongodb";
import {
  addWishlistPushToken,
  removeWishlistPushToken,
  replaceWishlistPushToken,
  getWishlistMatchesForCurrentInventory,
} from "../../services/wishlistService";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupCollections(overrides: { items?: any; current?: any } = {}) {
  mockCollections.items = {
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
    ...overrides.items,
  };
  mockCollections.current = {
    findOne: jest.fn().mockResolvedValue(null),
    ...overrides.current,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("wishlistService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.items;
    delete mockCollections.current;
  });

  // ── addWishlistPushToken ───────────────────────────────────────────────────

  describe("addWishlistPushToken", () => {
    it("adds push token to item's wishlistPushTokens using $addToSet", async () => {
      const itemId = new ObjectId();
      setupCollections();

      const result = await addWishlistPushToken(itemId, "ExponentPushToken[abc]");

      expect(result).toBe(true);
      expect(mockCollections.items.updateOne).toHaveBeenCalledWith(
        { _id: itemId },
        { $addToSet: { wishlistPushTokens: "ExponentPushToken[abc]" } }
      );
    });

    it("throws when item is not found (matchedCount = 0)", async () => {
      const itemId = new ObjectId();
      setupCollections({
        items: { updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }) },
      });

      await expect(addWishlistPushToken(itemId, "token")).rejects.toThrow(`Item not found: ${itemId}`);
    });

    it("throws when items collection is not initialized", async () => {
      await expect(addWishlistPushToken(new ObjectId(), "token")).rejects.toThrow(
        "Items collection not initialized"
      );
    });
  });

  // ── removeWishlistPushToken ────────────────────────────────────────────────

  describe("removeWishlistPushToken", () => {
    it("removes push token from item using $pull", async () => {
      const itemId = new ObjectId();
      setupCollections();

      const result = await removeWishlistPushToken(itemId, "ExponentPushToken[abc]");

      expect(result).toBe(true);
      expect(mockCollections.items.updateOne).toHaveBeenCalledWith(
        { _id: itemId },
        { $pull: { wishlistPushTokens: "ExponentPushToken[abc]" } }
      );
    });

    it("throws when item is not found", async () => {
      const itemId = new ObjectId();
      setupCollections({
        items: { updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }) },
      });

      await expect(removeWishlistPushToken(itemId, "token")).rejects.toThrow(`Item not found: ${itemId}`);
    });
  });

  // ── replaceWishlistPushToken ───────────────────────────────────────────────

  describe("replaceWishlistPushToken", () => {
    it("replaces old token with new token across all items that had it", async () => {
      const item1 = { _id: new ObjectId(), wishlistPushTokens: ["old-token"] };
      const item2 = { _id: new ObjectId(), wishlistPushTokens: ["old-token"] };

      setupCollections({
        items: {
          find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([item1, item2]) }),
          updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
        },
      });

      const result = await replaceWishlistPushToken("old-token", "new-token");

      expect(result).toBe(2);
      expect(mockCollections.items.updateOne).toHaveBeenCalledTimes(2);
      expect(mockCollections.items.updateOne).toHaveBeenCalledWith(
        { _id: item1._id },
        { $pull: { wishlistPushTokens: "old-token" }, $addToSet: { wishlistPushTokens: "new-token" } }
      );
    });

    it("returns 0 when no items had the old token", async () => {
      setupCollections();
      const result = await replaceWishlistPushToken("old-token", "new-token");
      expect(result).toBe(0);
    });
  });

  // ── getWishlistMatchesForCurrentInventory ──────────────────────────────────

  describe("getWishlistMatchesForCurrentInventory", () => {
    it("returns map of token → item names for wishlisted items in Baro inventory", async () => {
      const itemId1 = new ObjectId();
      const itemId2 = new ObjectId();

      setupCollections({
        current: {
          findOne: jest.fn().mockResolvedValue({ inventory: [itemId1, itemId2] }),
        },
        items: {
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              { _id: itemId1, name: "Primed Flow", wishlistPushTokens: ["token-A", "token-B"] },
              { _id: itemId2, name: "Prisma Grinlok", wishlistPushTokens: ["token-A"] },
            ]),
          }),
        },
      });

      const result = await getWishlistMatchesForCurrentInventory();

      expect(result.size).toBe(2);
      expect(result.get("token-A")).toEqual(["Primed Flow", "Prisma Grinlok"]);
      expect(result.get("token-B")).toEqual(["Primed Flow"]);
    });

    it("returns empty map when no current inventory", async () => {
      setupCollections({
        current: { findOne: jest.fn().mockResolvedValue(null) },
      });

      const result = await getWishlistMatchesForCurrentInventory();
      expect(result.size).toBe(0);
    });

    it("returns empty map when inventory is empty", async () => {
      setupCollections({
        current: { findOne: jest.fn().mockResolvedValue({ inventory: [] }) },
      });

      const result = await getWishlistMatchesForCurrentInventory();
      expect(result.size).toBe(0);
    });

    it("returns empty map when no items have wishlist tokens", async () => {
      const itemId = new ObjectId();
      setupCollections({
        current: { findOne: jest.fn().mockResolvedValue({ inventory: [itemId] }) },
        items: {
          find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        },
      });

      const result = await getWishlistMatchesForCurrentInventory();
      expect(result.size).toBe(0);
    });

    it("handles string item IDs in inventory (converts to ObjectId)", async () => {
      const itemId = new ObjectId();
      setupCollections({
        current: {
          findOne: jest.fn().mockResolvedValue({ inventory: [itemId.toHexString()] }),
        },
        items: {
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              { _id: itemId, name: "Item", wishlistPushTokens: ["token-1"] },
            ]),
          }),
        },
      });

      const result = await getWishlistMatchesForCurrentInventory();
      expect(result.size).toBe(1);
    });

    it("throws when items/current collection is not initialized", async () => {
      await expect(getWishlistMatchesForCurrentInventory()).rejects.toThrow(
        "Items or Current collection not initialized"
      );
    });
  });
});
