/**
 * Tests for tempModImageService
 */
import { ObjectId } from "mongodb";
import { storeTempModImage, resolveModImageSentinels, MOD_IMAGE_SENTINEL } from "../../services/tempModImageService";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
    connectToDatabase: jest.fn(),
    collections: {},
}));

import { collections, connectToDatabase } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockTempModImagesCollection(overrides: Record<string, jest.Mock> = {}) {
    const col = {
        updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
        find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
        ...overrides,
    };
    mockCollections.tempModImages = col;
    return col;
}

function makeItem(overrides: Record<string, any> = {}) {
    return {
        _id: new ObjectId(),
        name: "Test Mod",
        wikiImageLink: "normal-image.png",
        ...overrides,
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("tempModImageService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete mockCollections.tempModImages;
    });

    // ── storeTempModImage ────────────────────────────────────────────────────

    describe("storeTempModImage", () => {
        it("calls connectToDatabase", async () => {
            mockTempModImagesCollection();
            const itemId = new ObjectId();
            await storeTempModImage(itemId, "base64data");
            expect(connectToDatabase).toHaveBeenCalledTimes(1);
        });

        it("throws if tempModImages collection is not initialized", async () => {
            // collection is deliberately not set
            const itemId = new ObjectId();
            await expect(storeTempModImage(itemId, "base64data")).rejects.toThrow(
                "tempModImages collection not initialized"
            );
        });

        it("upserts the document with the correct itemId and imageData", async () => {
            const col = mockTempModImagesCollection();
            const itemId = new ObjectId();
            const base64 = "iVBORw0KGgoAAAANSUhEUg==";

            await storeTempModImage(itemId, base64);

            expect(col.updateOne).toHaveBeenCalledWith(
                { itemId },
                { $set: { itemId, imageData: base64 } },
                { upsert: true }
            );
        });

        it("performs an upsert so re-calling overwrites the previous image", async () => {
            const col = mockTempModImagesCollection();
            const itemId = new ObjectId();

            await storeTempModImage(itemId, "firstImage");
            await storeTempModImage(itemId, "secondImage");

            expect(col.updateOne).toHaveBeenCalledTimes(2);
            expect(col.updateOne).toHaveBeenLastCalledWith(
                { itemId },
                { $set: { itemId, imageData: "secondImage" } },
                { upsert: true }
            );
        });
    });

    // ── resolveModImageSentinels ─────────────────────────────────────────────

    describe("resolveModImageSentinels", () => {
        it("returns items unchanged when none have the sentinel", async () => {
            mockTempModImagesCollection();
            const items = [makeItem(), makeItem({ wikiImageLink: "other.png" })];

            const result = await resolveModImageSentinels(items);

            expect(result).toEqual(items);
        });

        it("does not query the DB when no sentinel items are present", async () => {
            const col = mockTempModImagesCollection();
            const items = [makeItem(), makeItem()];

            await resolveModImageSentinels(items);

            expect(col.find).not.toHaveBeenCalled();
        });

        it("returns items unchanged when tempModImages collection is not initialized", async () => {
            // collection deliberately not set
            const id = new ObjectId();
            const items = [makeItem({ _id: id, wikiImageLink: MOD_IMAGE_SENTINEL })];

            const result = await resolveModImageSentinels(items);

            // sentinel item is returned as-is since collection is absent
            expect(result[0].wikiImageLink).toBe(MOD_IMAGE_SENTINEL);
        });

        it("replaces sentinel with data URI for items that have a temp image", async () => {
            const id = new ObjectId();
            const base64 = "iVBORw0KGgoAAAANSUhEUg==";

            mockTempModImagesCollection({
                find: jest.fn().mockReturnValue({
                    toArray: jest.fn().mockResolvedValue([{ itemId: id, imageData: base64 }]),
                }),
            });

            const items = [makeItem({ _id: id, wikiImageLink: MOD_IMAGE_SENTINEL })];
            const result = await resolveModImageSentinels(items);

            expect(result[0].wikiImageLink).toBe(`data:image/png;base64,${base64}`);
        });

        it("leaves sentinel unchanged when no temp doc exists for that item", async () => {
            const id = new ObjectId();

            mockTempModImagesCollection({
                find: jest.fn().mockReturnValue({
                    // Returns docs for a *different* item — simulates missing entry
                    toArray: jest.fn().mockResolvedValue([{ itemId: new ObjectId(), imageData: "xyz" }]),
                }),
            });

            const items = [makeItem({ _id: id, wikiImageLink: MOD_IMAGE_SENTINEL })];
            const result = await resolveModImageSentinels(items);

            expect(result[0].wikiImageLink).toBe(MOD_IMAGE_SENTINEL);
        });

        it("handles a mix of sentinel and non-sentinel items correctly", async () => {
            const sentinelId = new ObjectId();
            const base64 = "abc123==";
            const normalItem = makeItem({ wikiImageLink: "real-image.png" });

            mockTempModImagesCollection({
                find: jest.fn().mockReturnValue({
                    toArray: jest.fn().mockResolvedValue([
                        { itemId: sentinelId, imageData: base64 },
                    ]),
                }),
            });

            const items = [
                makeItem({ _id: sentinelId, wikiImageLink: MOD_IMAGE_SENTINEL }),
                normalItem,
            ];

            const result = await resolveModImageSentinels(items);

            expect(result[0].wikiImageLink).toBe(`data:image/png;base64,${base64}`);
            expect(result[1].wikiImageLink).toBe("real-image.png");
        });

        it("performs a single batch query for multiple sentinel items", async () => {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            const col = mockTempModImagesCollection({
                find: jest.fn().mockReturnValue({
                    toArray: jest.fn().mockResolvedValue([
                        { itemId: id1, imageData: "img1" },
                        { itemId: id2, imageData: "img2" },
                    ]),
                }),
            });

            const items = [
                makeItem({ _id: id1, wikiImageLink: MOD_IMAGE_SENTINEL }),
                makeItem({ _id: id2, wikiImageLink: MOD_IMAGE_SENTINEL }),
            ];

            const result = await resolveModImageSentinels(items);

            // Only one DB call regardless of how many sentinel items there are
            expect(col.find).toHaveBeenCalledTimes(1);
            expect(result[0].wikiImageLink).toBe("data:image/png;base64,img1");
            expect(result[1].wikiImageLink).toBe("data:image/png;base64,img2");
        });

        it("does not mutate the original item objects", async () => {
            const id = new ObjectId();
            const base64 = "mutationTest==";

            mockTempModImagesCollection({
                find: jest.fn().mockReturnValue({
                    toArray: jest.fn().mockResolvedValue([{ itemId: id, imageData: base64 }]),
                }),
            });

            const original = makeItem({ _id: id, wikiImageLink: MOD_IMAGE_SENTINEL });
            const items = [original];

            await resolveModImageSentinels(items);

            // Original object should be untouched (spread creates a new object)
            expect(original.wikiImageLink).toBe(MOD_IMAGE_SENTINEL);
        });
    });
});
