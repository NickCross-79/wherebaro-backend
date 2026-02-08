/**
 * Tests for all remaining job files
 */
import { ObjectId } from "mongodb";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../services/likeService", () => ({
  addLike: jest.fn().mockResolvedValue({ _id: new ObjectId(), item_oid: new ObjectId(), uid: "user-1" }),
  removeLike: jest.fn().mockResolvedValue(true),
  getLikesForItem: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/wishlistService", () => ({
  addWishlistPushToken: jest.fn().mockResolvedValue(true),
  removeWishlistPushToken: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/reviewService", () => ({
  getReviewsForItem: jest.fn().mockResolvedValue([]),
  postReview: jest.fn().mockImplementation((review) => Promise.resolve({ ...review, _id: new ObjectId() })),
  updateReview: jest.fn().mockResolvedValue({ _id: new ObjectId(), content: "Updated" }),
  deleteReview: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../services/currentService", () => ({
  fetchCurrent: jest.fn().mockResolvedValue({ isActive: false, items: [] }),
  updateCurrentFromApi: jest.fn().mockResolvedValue({ updated: true }),
}));

jest.mock("../../services/itemService", () => ({
  fetchAllItems: jest.fn().mockResolvedValue([]),
}));

jest.mock("../../services/pushTokenService", () => ({
  registerPushToken: jest.fn().mockResolvedValue({ token: "token-1", isActive: true }),
  removePushToken: jest.fn(),
}));

jest.mock("../../services/notificationService", () => ({
  sendPushNotifications: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { likeJob, unlikeJob } from "../../jobs/like.job";
import { addWishlistPushTokenJob, removeWishlistPushTokenJob } from "../../jobs/wishlistPushTokens.job";
import { getReviewsJob } from "../../jobs/getReviews.job";
import { postReviewJob } from "../../jobs/postReview.job";
import { updateReviewJob } from "../../jobs/updateReview.job";
import { deleteReviewJob } from "../../jobs/deleteReview.job";
import { getCurrentJob } from "../../jobs/getCurrent.job";
import { updateCurrentJob } from "../../jobs/updateCurrent.job";
import { getAllItemsJob } from "../../jobs/getAllItems.job";
import { getLikesJob } from "../../jobs/getLikes.job";
import { registerPushTokenJob } from "../../jobs/registerPushToken.job";
import { removePushTokenJob } from "../../jobs/removePushToken.job";
import { sendTestNotification } from "../../jobs/testNotification.job";

import { addLike, removeLike, getLikesForItem } from "../../services/likeService";
import { addWishlistPushToken, removeWishlistPushToken } from "../../services/wishlistService";
import { getReviewsForItem, postReview, updateReview, deleteReview } from "../../services/reviewService";
import { fetchCurrent, updateCurrentFromApi } from "../../services/currentService";
import { fetchAllItems } from "../../services/itemService";
import { registerPushToken, removePushToken } from "../../services/pushTokenService";
import { sendPushNotifications } from "../../services/notificationService";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Job wrappers", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── like.job ───────────────────────────────────────────────────────────────

  describe("like.job", () => {
    it("likeJob converts string ID and calls addLike", async () => {
      const id = new ObjectId();
      await likeJob({ item_oid: id.toHexString(), uid: "user-1" });
      expect(addLike).toHaveBeenCalledWith(expect.any(ObjectId), "user-1");
    });

    it("unlikeJob converts string ID and calls removeLike", async () => {
      const id = new ObjectId();
      await unlikeJob({ item_oid: id.toHexString(), uid: "user-1" });
      expect(removeLike).toHaveBeenCalledWith(expect.any(ObjectId), "user-1");
    });
  });

  // ── wishlistPushTokens.job ─────────────────────────────────────────────────

  describe("wishlistPushTokens.job", () => {
    it("addWishlistPushTokenJob calls addWishlistPushToken with ObjectId", async () => {
      const id = new ObjectId();
      await addWishlistPushTokenJob({ item_oid: id.toHexString(), pushToken: "token-1" });
      expect(addWishlistPushToken).toHaveBeenCalledWith(expect.any(ObjectId), "token-1");
    });

    it("removeWishlistPushTokenJob calls removeWishlistPushToken with ObjectId", async () => {
      const id = new ObjectId();
      await removeWishlistPushTokenJob({ item_oid: id.toHexString(), pushToken: "token-1" });
      expect(removeWishlistPushToken).toHaveBeenCalledWith(expect.any(ObjectId), "token-1");
    });
  });

  // ── getReviews.job ─────────────────────────────────────────────────────────

  describe("getReviews.job", () => {
    it("converts string ID and returns reviews", async () => {
      const id = new ObjectId();
      await getReviewsJob(id.toHexString());
      expect(getReviewsForItem).toHaveBeenCalledWith(expect.any(ObjectId));
    });
  });

  // ── postReview.job ─────────────────────────────────────────────────────────

  describe("postReview.job", () => {
    it("creates Review from payload and calls postReview", async () => {
      const itemId = new ObjectId();
      const result = await postReviewJob({
        item_oid: itemId.toHexString(),
        user: "TestUser",
        content: "Great!",
        date: "2025-01-10",
        time: "12:00:00",
        uid: "uid-123",
      });

      expect(postReview).toHaveBeenCalled();
      const calledWith = (postReview as jest.Mock).mock.calls[0][0];
      expect(calledWith.user).toBe("TestUser");
      expect(calledWith.content).toBe("Great!");
      expect(calledWith.uid).toBe("uid-123");
    });
  });

  // ── updateReview.job ───────────────────────────────────────────────────────

  describe("updateReview.job", () => {
    it("converts ID and calls updateReview", async () => {
      const reviewId = new ObjectId();
      await updateReviewJob({
        review_id: reviewId.toHexString(),
        uid: "uid-1",
        content: "Updated!",
        date: "2025-02-01",
        time: "15:00:00",
      });

      expect(updateReview).toHaveBeenCalledWith(
        expect.any(ObjectId),
        "uid-1",
        "Updated!",
        "2025-02-01",
        "15:00:00"
      );
    });
  });

  // ── deleteReview.job ───────────────────────────────────────────────────────

  describe("deleteReview.job", () => {
    it("converts ID and calls deleteReview", async () => {
      const reviewId = new ObjectId();
      await deleteReviewJob({ review_id: reviewId.toHexString(), uid: "uid-1" });
      expect(deleteReview).toHaveBeenCalledWith(expect.any(ObjectId), "uid-1");
    });
  });

  // ── getCurrent.job ─────────────────────────────────────────────────────────

  describe("getCurrent.job", () => {
    it("delegates to fetchCurrent", async () => {
      await getCurrentJob();
      expect(fetchCurrent).toHaveBeenCalled();
    });
  });

  // ── updateCurrent.job ──────────────────────────────────────────────────────

  describe("updateCurrent.job", () => {
    it("delegates to updateCurrentFromApi", async () => {
      await updateCurrentJob();
      expect(updateCurrentFromApi).toHaveBeenCalled();
    });
  });

  // ── getAllItems.job ─────────────────────────────────────────────────────────

  describe("getAllItems.job", () => {
    it("delegates to fetchAllItems", async () => {
      await getAllItemsJob();
      expect(fetchAllItems).toHaveBeenCalled();
    });
  });

  // ── getLikes.job ───────────────────────────────────────────────────────────

  describe("getLikes.job", () => {
    it("converts string ID and calls getLikesForItem", async () => {
      const id = new ObjectId();
      await getLikesJob(id.toHexString());
      expect(getLikesForItem).toHaveBeenCalledWith(expect.any(ObjectId));
    });
  });

  // ── registerPushToken.job ──────────────────────────────────────────────────

  describe("registerPushToken.job", () => {
    it("delegates to registerPushToken", async () => {
      await registerPushTokenJob({ token: "token-1", deviceId: "dev-1" });
      expect(registerPushToken).toHaveBeenCalledWith({ token: "token-1", deviceId: "dev-1" });
    });
  });

  // ── removePushToken.job ────────────────────────────────────────────────────

  describe("removePushToken.job", () => {
    it("delegates to removePushToken", async () => {
      await removePushTokenJob("token-1");
      expect(removePushToken).toHaveBeenCalledWith("token-1");
    });
  });

  // ── testNotification.job ───────────────────────────────────────────────────

  describe("testNotification.job", () => {
    it("sends a test notification with current time", async () => {
      await sendTestNotification();
      expect(sendPushNotifications).toHaveBeenCalledWith(
        expect.stringContaining("Test"),
        expect.stringContaining("test notification"),
        expect.objectContaining({ type: "test" })
      );
    });
  });
});
