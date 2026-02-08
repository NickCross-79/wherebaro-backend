/**
 * Tests for models
 */
import { ObjectId } from "mongodb";
import Item from "../../models/Item";
import Review from "../../models/Review";
import Like from "../../models/Like";

describe("Models", () => {
  describe("Item", () => {
    it("creates an Item with all required fields", () => {
      const item = new Item(
        "Primed Flow",
        "https://img.com/flow.png",
        "https://wiki.warframe.com/Primed_Flow",
        175000,
        300,
        "Mod",
        ["2024-01-10", "2024-06-15"],
        ["like-id-1"],
        ["review-id-1"]
      );

      expect(item.name).toBe("Primed Flow");
      expect(item.image).toBe("https://img.com/flow.png");
      expect(item.link).toBe("https://wiki.warframe.com/Primed_Flow");
      expect(item.creditPrice).toBe(175000);
      expect(item.ducatPrice).toBe(300);
      expect(item.type).toBe("Mod");
      expect(item.offeringDates).toEqual(["2024-01-10", "2024-06-15"]);
      expect(item.likes).toEqual(["like-id-1"]);
      expect(item.reviews).toEqual(["review-id-1"]);
    });

    it("supports optional uniqueName", () => {
      const item = new Item("Test", "", "", 0, 0, "Misc", [], [], [], "/Lotus/Test");
      expect(item.uniqueName).toBe("/Lotus/Test");
    });

    it("supports optional wishlistPushTokens", () => {
      const item = new Item("Test", "", "", 0, 0, "Misc", [], [], [], undefined, ["token-1"]);
      expect(item.wishlistPushTokens).toEqual(["token-1"]);
    });

    it("defaults optional fields to undefined", () => {
      const item = new Item("Test", "", "", 0, 0, "Misc", [], [], []);
      expect(item.uniqueName).toBeUndefined();
      expect(item.wishlistPushTokens).toBeUndefined();
    });
  });

  describe("Review", () => {
    it("creates a Review with all fields", () => {
      const itemOid = new ObjectId();
      const review = new Review(undefined, itemOid, "TestUser", "Great item!", "2025-01-10", "12:00:00", "uid-123");

      expect(review._id).toBeUndefined();
      expect(review.item_oid).toEqual(itemOid);
      expect(review.user).toBe("TestUser");
      expect(review.content).toBe("Great item!");
      expect(review.date).toBe("2025-01-10");
      expect(review.time).toBe("12:00:00");
      expect(review.uid).toBe("uid-123");
    });

    it("accepts an existing _id", () => {
      const id = new ObjectId();
      const review = new Review(id, new ObjectId(), "User", "Content", "date", "time", "uid");
      expect(review._id).toEqual(id);
    });
  });

  describe("Like", () => {
    it("creates a Like with all fields", () => {
      const itemOid = new ObjectId();
      const like = new Like(undefined, itemOid, "user-123");

      expect(like._id).toBeUndefined();
      expect(like.item_oid).toEqual(itemOid);
      expect(like.uid).toBe("user-123");
    });

    it("accepts an existing _id", () => {
      const id = new ObjectId();
      const like = new Like(id, new ObjectId(), "user-1");
      expect(like._id).toEqual(id);
    });
  });
});
