/**
 * Tests for likeService
 */
import { ObjectId } from "mongodb";
import { addLike, removeLike, getLikesForItem } from "../../services/likeService";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupCollections(overrides: { likes?: any; items?: any } = {}) {
  mockCollections.likes = {
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    findOne: jest.fn().mockResolvedValue(null),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
    ...overrides.likes,
  };
  mockCollections.items = {
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    ...overrides.items,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("likeService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.likes;
    delete mockCollections.items;
  });

  // ── addLike ────────────────────────────────────────────────────────────────

  describe("addLike", () => {
    it("inserts a like and pushes ID to item", async () => {
      const itemId = new ObjectId();
      const likeId = new ObjectId();
      setupCollections({
        likes: { insertOne: jest.fn().mockResolvedValue({ insertedId: likeId }) },
      });

      const result = await addLike(itemId, "user-123");

      expect(result.item_oid).toEqual(itemId);
      expect(result.uid).toBe("user-123");
      expect(result._id).toEqual(likeId);
      expect(mockCollections.likes.insertOne).toHaveBeenCalled();
      expect(mockCollections.items.updateOne).toHaveBeenCalledWith(
        { _id: itemId },
        { $push: { likes: likeId.toString() } }
      );
    });

    it("throws when likes collection is not initialized", async () => {
      mockCollections.items = {};
      await expect(addLike(new ObjectId(), "user-1")).rejects.toThrow("Likes collection not initialized");
    });

    it("throws when items collection is not initialized", async () => {
      mockCollections.likes = { insertOne: jest.fn() };
      await expect(addLike(new ObjectId(), "user-1")).rejects.toThrow("Items collection not initialized");
    });
  });

  // ── removeLike ─────────────────────────────────────────────────────────────

  describe("removeLike", () => {
    it("deletes a like and pulls ID from item", async () => {
      const itemId = new ObjectId();
      const likeId = new ObjectId();
      setupCollections({
        likes: {
          findOne: jest.fn().mockResolvedValue({ _id: likeId, item_oid: itemId, uid: "user-1" }),
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        },
      });

      const result = await removeLike(itemId, "user-1");

      expect(result).toBe(true);
      expect(mockCollections.likes.deleteOne).toHaveBeenCalledWith({ _id: likeId, uid: "user-1" });
      expect(mockCollections.items.updateOne).toHaveBeenCalledWith(
        { _id: itemId },
        { $pull: { likes: likeId.toString() } }
      );
    });

    it("returns false when like is not found", async () => {
      const itemId = new ObjectId();
      setupCollections();

      const result = await removeLike(itemId, "nonexistent-user");
      expect(result).toBe(false);
    });

    it("throws when likes collection is not initialized", async () => {
      mockCollections.items = {};
      await expect(removeLike(new ObjectId(), "user")).rejects.toThrow("Likes collection not initialized");
    });
  });

  // ── getLikesForItem ────────────────────────────────────────────────────────

  describe("getLikesForItem", () => {
    it("returns likes for the specified item", async () => {
      const itemId = new ObjectId();
      const likes = [
        { _id: new ObjectId(), item_oid: itemId, uid: "user-1" },
        { _id: new ObjectId(), item_oid: itemId, uid: "user-2" },
      ];
      setupCollections({
        likes: { find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(likes) }) },
      });

      const result = await getLikesForItem(itemId);

      expect(result).toHaveLength(2);
      expect(mockCollections.likes.find).toHaveBeenCalledWith({ item_oid: itemId });
    });

    it("returns empty array when no likes exist", async () => {
      setupCollections();
      const result = await getLikesForItem(new ObjectId());
      expect(result).toEqual([]);
    });

    it("throws when likes collection is not initialized", async () => {
      await expect(getLikesForItem(new ObjectId())).rejects.toThrow("Likes collection not initialized");
    });
  });
});
