/**
 * Tests for syncService
 */
import { ObjectId } from "mongodb";
import { getChangedFields, syncItems } from "../../services/syncService";
import Item from "../../models/Item";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
    connectToDatabase: jest.fn(),
    collections: {},
}));

import { collections } from "../../db/database.service";

const mockCollections = collections as Record<string, any>;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("syncService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete mockCollections.items;
    });

    // ── getChangedFields ─────────────────────────────────────────────────────

    describe("getChangedFields", () => {
        it("returns null when nothing changed", () => {
            const wiki = {
                name: "Primed Flow",
                image: "img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10"],
            };
            const db = { ...wiki };
            expect(getChangedFields(wiki, db)).toBeNull();
        });

        it("detects changed scalar fields", () => {
            const wiki = {
                name: "Primed Flow",
                image: "new-img.png",
                link: "/link",
                creditPrice: 200000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10"],
            };
            const db = {
                name: "Primed Flow",
                image: "old-img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10"],
            };
            const result = getChangedFields(wiki, db);
            expect(result).toEqual({
                image: "new-img.png",
                creditPrice: 200000,
            });
        });

        it("detects changed offeringDates regardless of order", () => {
            const wiki = {
                name: "Primed Flow",
                image: "img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10", "2024-03-15"],
            };
            const db = {
                name: "Primed Flow",
                image: "img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10"],
            };
            const result = getChangedFields(wiki, db);
            expect(result).toEqual({
                offeringDates: ["2024-01-10", "2024-03-15"],
            });
        });

        it("treats same offeringDates in different order as unchanged", () => {
            const wiki = {
                name: "Primed Flow",
                image: "img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-03-15", "2024-01-10"],
            };
            const db = {
                name: "Primed Flow",
                image: "img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10", "2024-03-15"],
            };
            expect(getChangedFields(wiki, db)).toBeNull();
        });

        it("does not include preserved fields even if they differ", () => {
            const wiki = {
                name: "Primed Flow",
                image: "img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10"],
            };
            const db = {
                ...wiki,
                _id: new ObjectId(),
                likes: ["user1"],
                reviews: ["review1"],
                uniqueName: "/some/path",
                wishlistPushTokens: ["token1"],
                wishlistCount: 5,
            };
            expect(getChangedFields(wiki, db)).toBeNull();
        });
    });

    // ── syncItems ────────────────────────────────────────────────────────────

    describe("syncItems", () => {
        it("throws when items collection is not initialized", async () => {
            const items = [new Item("Test", "img.png", "/link", 100, 200, "Mod", [], [], [])];
            await expect(syncItems(items)).rejects.toThrow("Items collection not initialized");
        });

        it("updates only changed fields on existing items", async () => {
            const dbItemId = new ObjectId();
            const mockFindOne = jest.fn().mockResolvedValue({
                _id: dbItemId,
                name: "Primed Flow",
                image: "old-img.png",
                link: "/link",
                creditPrice: 175000,
                ducatPrice: 300,
                type: "Mod",
                offeringDates: ["2024-01-10"],
                likes: ["user1"],
                reviews: ["review1"],
                uniqueName: "/some/path",
                wishlistPushTokens: ["token1"],
                wishlistCount: 3,
            });
            const mockUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
            const mockInsertOne = jest.fn();

            mockCollections.items = {
                findOne: mockFindOne,
                updateOne: mockUpdateOne,
                insertOne: mockInsertOne,
            };

            const wikiItems = [
                new Item("Primed Flow", "new-img.png", "/link", 175000, 300, "Mod", ["2024-01-10"], [], []),
            ];

            const result = await syncItems(wikiItems);

            expect(result.matchedItems).toBe(1);
            expect(result.updatedItems).toBe(1);
            expect(result.newItems).toBe(0);
            expect(result.changes).toEqual([
                { name: "Primed Flow", fieldsUpdated: ["image"] },
            ]);

            // Should only update the changed field, not preserved ones
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: dbItemId },
                { $set: { image: "new-img.png" } }
            );
            expect(mockInsertOne).not.toHaveBeenCalled();
        });

        it("skips update when item has no changes", async () => {
            mockCollections.items = {
                findOne: jest.fn().mockResolvedValue({
                    _id: new ObjectId(),
                    name: "Primed Flow",
                    image: "img.png",
                    link: "/link",
                    creditPrice: 175000,
                    ducatPrice: 300,
                    type: "Mod",
                    offeringDates: ["2024-01-10"],
                }),
                updateOne: jest.fn(),
                insertOne: jest.fn(),
            };

            const wikiItems = [
                new Item("Primed Flow", "img.png", "/link", 175000, 300, "Mod", ["2024-01-10"], [], []),
            ];

            const result = await syncItems(wikiItems);

            expect(result.matchedItems).toBe(1);
            expect(result.updatedItems).toBe(0);
            expect(result.changes).toEqual([]);
            expect(mockCollections.items.updateOne).not.toHaveBeenCalled();
        });

        it("inserts new items that don't exist in DB", async () => {
            const mockInsertOne = jest.fn().mockResolvedValue({ insertedId: new ObjectId() });

            mockCollections.items = {
                findOne: jest.fn().mockResolvedValue(null),
                updateOne: jest.fn(),
                insertOne: mockInsertOne,
            };

            const wikiItems = [
                new Item("New Item", "img.png", "/link", 100000, 200, "Weapon", ["2024-05-01"], [], []),
            ];

            const result = await syncItems(wikiItems);

            expect(result.newItems).toBe(1);
            expect(result.matchedItems).toBe(0);
            expect(mockInsertOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: "New Item",
                    image: "img.png",
                    link: "/link",
                    creditPrice: 100000,
                    ducatPrice: 200,
                    type: "Weapon",
                    offeringDates: ["2024-05-01"],
                    likes: [],
                    reviews: [],
                    wishlistPushTokens: [],
                    wishlistCount: 0,
                })
            );
        });

        it("handles multiple items with mixed results", async () => {
            const existingId = new ObjectId();
            const findOneMock = jest.fn()
                .mockResolvedValueOnce({
                    _id: existingId,
                    name: "Primed Flow",
                    image: "img.png",
                    link: "/link",
                    creditPrice: 175000,
                    ducatPrice: 300,
                    type: "Mod",
                    offeringDates: ["2024-01-10"],
                })
                .mockResolvedValueOnce(null);

            mockCollections.items = {
                findOne: findOneMock,
                updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
                insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
            };

            const wikiItems = [
                new Item("Primed Flow", "img.png", "/link", 175000, 300, "Mod", ["2024-01-10"], [], []),
                new Item("New Weapon", "weapon.png", "/weapon", 50000, 500, "Weapon", ["2024-06-01"], [], []),
            ];

            const result = await syncItems(wikiItems);

            expect(result.totalWikiItems).toBe(2);
            expect(result.matchedItems).toBe(1);
            expect(result.updatedItems).toBe(0);
            expect(result.newItems).toBe(1);
        });
    });
});
