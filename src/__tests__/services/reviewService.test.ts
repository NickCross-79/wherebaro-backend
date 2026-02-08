/**
 * Tests for reviewService
 */
import { ObjectId } from "mongodb";
import { getReviewsForItem, postReview, updateReview, deleteReview } from "../../services/reviewService";
import Review from "../../models/Review";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupCollections(overrides: { reviews?: any; items?: any } = {}) {
  mockCollections.reviews = {
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }) }),
    findOne: jest.fn().mockResolvedValue(null),
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    ...overrides.reviews,
  };
  mockCollections.items = {
    findOne: jest.fn().mockResolvedValue(null),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    ...overrides.items,
  };
}

function makeReview(overrides: Partial<Review> = {}): Review {
  return new Review(
    overrides._id ?? undefined,
    overrides.item_oid ?? new ObjectId(),
    overrides.user ?? "TestUser",
    overrides.content ?? "Great item!",
    overrides.date ?? "2025-01-10",
    overrides.time ?? "12:00:00",
    overrides.uid ?? "uid-123"
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("reviewService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.reviews;
    delete mockCollections.items;
  });

  // ── getReviewsForItem ──────────────────────────────────────────────────────

  describe("getReviewsForItem", () => {
    it("fetches and returns reviews for an item that has them", async () => {
      const itemId = new ObjectId();
      const reviewId = new ObjectId();
      const reviews = [{ _id: reviewId, item_oid: itemId, content: "Nice!" }];

      setupCollections({
        items: { findOne: jest.fn().mockResolvedValue({ _id: itemId, reviews: [reviewId.toString()] }) },
        reviews: {
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(reviews) }),
          }),
        },
      });

      const result = await getReviewsForItem(itemId);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Nice!");
    });

    it("returns empty array when item has no reviews", async () => {
      const itemId = new ObjectId();
      setupCollections({
        items: { findOne: jest.fn().mockResolvedValue({ _id: itemId, reviews: [] }) },
      });

      const result = await getReviewsForItem(itemId);
      expect(result).toEqual([]);
    });

    it("throws when item is not found", async () => {
      const itemId = new ObjectId();
      setupCollections();

      await expect(getReviewsForItem(itemId)).rejects.toThrow("Item not found");
    });

    it("throws when items collection is not initialized", async () => {
      await expect(getReviewsForItem(new ObjectId())).rejects.toThrow("Items collection not initialized");
    });

    it("throws when reviews collection is not initialized", async () => {
      mockCollections.items = { findOne: jest.fn() };
      await expect(getReviewsForItem(new ObjectId())).rejects.toThrow("Reviews collection not initialized");
    });
  });

  // ── postReview ─────────────────────────────────────────────────────────────

  describe("postReview", () => {
    it("inserts review and pushes ID to item", async () => {
      const reviewId = new ObjectId();
      const review = makeReview();

      setupCollections({
        reviews: {
          findOne: jest.fn().mockResolvedValue(null), // no existing review
          insertOne: jest.fn().mockResolvedValue({ insertedId: reviewId }),
        },
      });

      const result = await postReview(review);

      expect(result._id).toEqual(reviewId);
      expect(mockCollections.reviews.insertOne).toHaveBeenCalledWith(review);
      expect(mockCollections.items.updateOne).toHaveBeenCalledWith(
        { _id: review.item_oid },
        { $push: { reviews: reviewId.toString() } }
      );
    });

    it("throws REVIEW_EXISTS when user already reviewed the item", async () => {
      const review = makeReview();
      setupCollections({
        reviews: {
          findOne: jest.fn().mockResolvedValue({ _id: new ObjectId(), uid: review.uid }),
          insertOne: jest.fn(),
        },
      });

      try {
        await postReview(review);
        fail("Expected error to be thrown");
      } catch (error: any) {
        expect(error.message).toBe("User has already reviewed this item");
        expect(error.code).toBe("REVIEW_EXISTS");
      }
    });

    it("throws when reviews collection is not initialized", async () => {
      mockCollections.items = {};
      await expect(postReview(makeReview())).rejects.toThrow("Reviews collection not initialized");
    });
  });

  // ── updateReview ───────────────────────────────────────────────────────────

  describe("updateReview", () => {
    it("updates review content and returns updated review", async () => {
      const reviewId = new ObjectId();
      const updatedReview = { _id: reviewId, content: "Updated!", date: "2025-02-01", time: "15:00:00" };

      setupCollections({
        reviews: {
          updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
          findOne: jest.fn().mockResolvedValue(updatedReview),
        },
      });

      const result = await updateReview(reviewId, "uid-1", "Updated!", "2025-02-01", "15:00:00");

      expect(result).toEqual(updatedReview);
      expect(mockCollections.reviews.updateOne).toHaveBeenCalledWith(
        { _id: reviewId, uid: "uid-1" },
        { $set: { content: "Updated!", date: "2025-02-01", time: "15:00:00" } }
      );
    });

    it("returns null when review not found after update", async () => {
      const reviewId = new ObjectId();
      setupCollections({
        reviews: {
          updateOne: jest.fn().mockResolvedValue({ matchedCount: 0 }),
          findOne: jest.fn().mockResolvedValue(null),
        },
      });

      const result = await updateReview(reviewId, "uid-unknown", "text", "date", "time");
      expect(result).toBeNull();
    });

    it("throws when reviews collection is not initialized", async () => {
      await expect(updateReview(new ObjectId(), "u", "c", "d", "t")).rejects.toThrow(
        "Reviews collection not initialized"
      );
    });
  });

  // ── deleteReview ───────────────────────────────────────────────────────────

  describe("deleteReview", () => {
    it("deletes review and removes ID from item", async () => {
      const reviewId = new ObjectId();
      const itemId = new ObjectId();

      setupCollections({
        reviews: {
          findOne: jest.fn().mockResolvedValue({ _id: reviewId, item_oid: itemId, uid: "uid-1" }),
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        },
      });

      const result = await deleteReview(reviewId, "uid-1");

      expect(result).toBe(true);
      expect(mockCollections.reviews.deleteOne).toHaveBeenCalledWith({ _id: reviewId, uid: "uid-1" });
      expect(mockCollections.items.updateOne).toHaveBeenCalledWith(
        { _id: itemId },
        { $pull: { reviews: reviewId.toString() } }
      );
    });

    it("returns false when review not found", async () => {
      setupCollections();
      const result = await deleteReview(new ObjectId(), "uid-unknown");
      expect(result).toBe(false);
    });

    it("throws when reviews collection is not initialized", async () => {
      await expect(deleteReview(new ObjectId(), "uid")).rejects.toThrow("Reviews collection not initialized");
    });
  });
});
