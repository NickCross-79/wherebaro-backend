/**
 * Tests for itemService
 */
import { ObjectId } from "mongodb";
import { fetchAllItems, resolveBaroInventory } from "../../services/itemService";
import { BaroApiInventoryItem } from "../../services/baroApiService";
import Item from "../../models/Item";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

jest.mock("../../utils/itemMappings", () => ({
  isIgnoredBaroItem: jest.fn((name: string) =>
    ["void surplus", "dragon mod pack"].includes(name.toLowerCase())
  ),
}));

// Mock @wfcd/items — returns a fake list of items
jest.mock("@wfcd/items", () => {
  return jest.fn().mockImplementation(() => [
    {
      name: "Archwing Rifle Ammo Max",
      uniqueName: "/Lotus/Upgrades/Mods/Archwing/Rifle/Expert/ArchwingRifleAmmoMaxModExpert",
      imageName: "archwing-rifle-ammo-max.png",
      type: "Mod",
      category: "Mods",
    },
    {
      name: "Prisma Grinlok",
      uniqueName: "/Lotus/Weapons/Tenno/Rifle/PrismaGrinlok",
      imageName: "prisma-grinlok.png",
      type: "Primary",
      category: "Weapons",
    },
  ]);
});

// Mock the mod image generator so tests don't attempt real canvas rendering
jest.mock("../../services/modGeneratorLoader");
import { generateModImage } from "../../services/modGeneratorLoader";
const mockGenerate = generateModImage as jest.MockedFunction<typeof generateModImage>;

// Mock tempModImageService so storeTempModImage calls are captured
jest.mock("../../services/tempModImageService", () => ({
  storeTempModImage: jest.fn().mockResolvedValue(undefined),
  MOD_IMAGE_SENTINEL: "temp:modImage",
}));
import { storeTempModImage } from "../../services/tempModImageService";
const mockStoreTempModImage = storeTempModImage as jest.MockedFunction<typeof storeTempModImage>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a mock `items` collection.
 * `findResults` is what the batch `.find().project().toArray()` inside
 * `identifyNewItems` will return — pass the uniqueNames of items that
 * already exist in the DB so the service knows they are NOT new.
 */
function mockItemsCollection(
  overrides: Record<string, jest.Mock> = {},
  findResults: any[] = []
) {
  const toArray = jest.fn().mockResolvedValue(findResults);
  const col = {
    find: jest.fn().mockReturnValue({
      project: jest.fn().mockReturnValue({ toArray }),
      toArray,
    }),
    findOne: jest.fn().mockResolvedValue(null),
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    ...overrides,
  };
  mockCollections.items = col;
  return col;
}

function mockUnknownItemsCollection(overrides: Record<string, jest.Mock> = {}) {
  const col = {
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    ...overrides,
  };
  mockCollections.unknownItems = col;
  return col;
}

function inventoryEntry(overrides: Partial<BaroApiInventoryItem> = {}): BaroApiInventoryItem {
  return {
    uniqueName: "/Lotus/Upgrades/Mods/Archwing/Rifle/Expert/ArchwingRifleAmmoMaxModExpert",
    item: "Archwing Rifle Ammo Max",
    ducats: 300,
    credits: 175000,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("itemService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.items;
    delete mockCollections.unknownItems;
  });

  // ── fetchAllItems ──────────────────────────────────────────────────────────

  describe("fetchAllItems", () => {
    it("returns all items from the database", async () => {
      const items = [
        { _id: new ObjectId(), name: "Primed Flow" },
        { _id: new ObjectId(), name: "Prisma Grinlok" },
      ];
      mockItemsCollection({
        find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(items) }),
      });

      const result = await fetchAllItems();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Primed Flow");
    });

    it("returns empty array when no items exist", async () => {
      mockItemsCollection();
      const result = await fetchAllItems();
      expect(result).toEqual([]);
    });

    it("throws when items collection is not initialized", async () => {
      await expect(fetchAllItems()).rejects.toThrow("Database collection not initialized");
    });
  });

  // ── resolveBaroInventory ───────────────────────────────────────────────────

  describe("resolveBaroInventory", () => {
    it("resolves existing items by uniqueName key match", async () => {
      const existingId = new ObjectId();
      const existingUniqueName = "/Lotus/Upgrades/Mods/Archwing/Rifle/Expert/ArchwingRifleAmmoMaxModExpert";
      // Pass uniqueName in findResults so identifyNewItems sees this item as
      // already in the DB and does NOT flag it as new (preventing image gen).
      // findOne returns null for name queries and the existing item for key queries.
      const col = mockItemsCollection(
        {
          findOne: jest.fn().mockImplementation((query: any) => {
            // The key lookup accepts either stored prefix form, so it queries
            // with $in rather than a bare string
            const candidates: string[] = query?.uniqueName?.$in
              ?? (typeof query?.uniqueName === "string" ? [query.uniqueName] : []);
            if (candidates.includes(existingUniqueName)) {
              return Promise.resolve({ _id: existingId, uniqueName: existingUniqueName });
            }
            return Promise.resolve(null);
          }),
        },
        [{ uniqueName: existingUniqueName }]
      );
      mockUnknownItemsCollection();

      const result = await resolveBaroInventory([inventoryEntry()]);

      expect(result.inventoryIds).toHaveLength(1);
      expect(result.inventoryIds[0]).toEqual(existingId);
      expect(col.updateOne).toHaveBeenCalledWith(
        { _id: existingId },
        { $addToSet: { offeringDates: expect.any(String) } }
      );
    });

    /**
     * Regression cover for the false NEW badge.
     *
     * The app flags an item as NEW when it has exactly one offering date. A
     * duplicate document is inserted with `offeringDates: [today]`, so any
     * failure to recognise an existing item resurfaces a long-standing item as
     * brand new. Identity therefore has to survive the ways a name legitimately
     * differs between the wiki (which seeds the DB) and the Baro API.
     */
    describe("existing-item identity", () => {
      /** Mocks findOne so only `storedName` matches, exactly or case-insensitively. */
      function mockStoredByName(storedName: string, storedId: ObjectId, uniqueName?: string) {
        return mockItemsCollection({
          findOne: jest.fn().mockImplementation((query: any) => {
            if (typeof query?.name === "string") {
              return Promise.resolve(query.name === storedName ? { _id: storedId, uniqueName } : null);
            }
            if (query?.name?.$regex instanceof RegExp) {
              return Promise.resolve(query.name.$regex.test(storedName) ? { _id: storedId, uniqueName } : null);
            }
            return Promise.resolve(null);
          }),
        });
      }

      it("matches an existing item whose stored name differs only by case", async () => {
        const existingId = new ObjectId();
        const col = mockStoredByName("Masker's Theodolite CrewSuit", existingId, "/Lotus/Types/X");
        mockUnknownItemsCollection();

        const result = await resolveBaroInventory([
          inventoryEntry({ item: "Masker's Theodolite Crewsuit", uniqueName: "/Lotus/StoreItems/Types/X" }),
        ]);

        expect(result.inventoryIds).toEqual([existingId]);
        expect(result.unmatchedItems).toEqual([]);
        expect(col.insertOne).not.toHaveBeenCalled();
        expect(col.updateOne).toHaveBeenCalledWith(
          { _id: existingId },
          { $addToSet: { offeringDates: expect.any(String) } }
        );
      });

      it("matches an existing item stored with the /Lotus/StoreItems/ prefix", async () => {
        // Items whose uniqueName was backfilled from a raw Baro API path keep the
        // store spelling; the key lookup must still find them
        const existingId = new ObjectId();
        const stored = "/Lotus/StoreItems/Types/Items/ShipDecos/Thing";
        const col = mockItemsCollection({
          findOne: jest.fn().mockImplementation((query: any) => {
            const candidates: string[] = query?.uniqueName?.$in ?? [];
            return Promise.resolve(candidates.includes(stored) ? { _id: existingId, uniqueName: stored } : null);
          }),
        });
        mockUnknownItemsCollection();

        const result = await resolveBaroInventory([
          inventoryEntry({ item: "Some Renamed Deco", uniqueName: "/Lotus/Types/Items/ShipDecos/Thing" }),
        ]);

        expect(result.inventoryIds).toEqual([existingId]);
        expect(col.insertOne).not.toHaveBeenCalled();
      });

      it("backfills a missing uniqueName in canonical form, not the raw store path", async () => {
        // Storing the raw path left the item unfindable by key on the next visit
        const existingId = new ObjectId();
        const col = mockStoredByName("Ki'Teer Domestik Drone", existingId, undefined);
        mockUnknownItemsCollection();

        await resolveBaroInventory([
          inventoryEntry({
            item: "Ki'Teer Domestik Drone",
            uniqueName: "/Lotus/StoreItems/Types/Items/ShipDecos/LisetPropCleaningDroneBaro",
          }),
        ]);

        expect(col.updateOne).toHaveBeenCalledWith(
          { _id: existingId },
          expect.objectContaining({
            $set: { uniqueName: "/Lotus/Types/Items/ShipDecos/LisetPropCleaningDroneBaro" },
          })
        );
      });

      it("still records a genuinely unknown item rather than matching something else", async () => {
        const col = mockItemsCollection({ findOne: jest.fn().mockResolvedValue(null) });
        mockUnknownItemsCollection();

        const result = await resolveBaroInventory([
          inventoryEntry({ item: "Totally Fictional Item", uniqueName: "/Lotus/Nope/Nothing" }),
        ]);

        expect(result.inventoryIds).toEqual([]);
        expect(result.unmatchedItems).toEqual(["Totally Fictional Item"]);
      });
    });

    it("creates new item when not found in DB but matched via wfcd", async () => {
      const insertedId = new ObjectId();
      const col = mockItemsCollection({
        findOne: jest.fn().mockResolvedValue(null),
        insertOne: jest.fn().mockResolvedValue({ insertedId }),
      });
      mockUnknownItemsCollection();

      const result = await resolveBaroInventory([inventoryEntry()]);

      expect(result.inventoryIds).toHaveLength(1);
      expect(result.inventoryIds[0]).toEqual(insertedId);
      expect(col.insertOne).toHaveBeenCalled();
    });

    it("skips ignored items (Void Surplus, Dragon Mod Pack)", async () => {
      mockItemsCollection();
      mockUnknownItemsCollection();

      const result = await resolveBaroInventory([
        inventoryEntry({ item: "Void Surplus", uniqueName: "/Void" }),
        inventoryEntry({ item: "Dragon Mod Pack", uniqueName: "/Dragon" }),
      ]);

      expect(result.inventoryIds).toHaveLength(0);
      expect(result.ignoredItems).toEqual(["Void Surplus", "Dragon Mod Pack"]);
    });

    it("reports unmatched items when not in DB and not in wfcd", async () => {
      mockItemsCollection({ findOne: jest.fn().mockResolvedValue(null) });
      mockUnknownItemsCollection();

      const entry = inventoryEntry({
        item: "Unknown Widget",
        uniqueName: "/Lotus/Unknown/Widget/NothingMatchesThis",
      });

      const result = await resolveBaroInventory([entry]);

      expect(result.unmatchedItems).toContain("Unknown Widget");
      expect(result.inventoryIds).toHaveLength(0);
    });

    it("logs unknown items to the unknownItems collection", async () => {
      mockItemsCollection({ findOne: jest.fn().mockResolvedValue(null) });
      const unknownCol = mockUnknownItemsCollection();

      const entry = inventoryEntry({
        item: "Mystery Item",
        uniqueName: "/Lotus/Unknown/MysteryItemXyz",
      });

      await resolveBaroInventory([entry]);

      expect(unknownCol.updateOne).toHaveBeenCalledWith(
        { uniqueName: "/Lotus/Unknown/MysteryItemXyz" },
        expect.objectContaining({
          $set: expect.objectContaining({ apiItemName: "Mystery Item" }),
          $setOnInsert: expect.objectContaining({ firstSeen: expect.any(String) }),
        }),
        { upsert: true }
      );
    });

    it("handles empty inventory array", async () => {
      mockItemsCollection();
      const result = await resolveBaroInventory([]);
      expect(result.inventoryIds).toEqual([]);
      expect(result.unmatchedItems).toEqual([]);
      expect(result.ignoredItems).toEqual([]);
    });

    it("throws when items collection is not initialized", async () => {
      await expect(resolveBaroInventory([inventoryEntry()])).rejects.toThrow(
        "Items collection not initialized"
      );
    });

    it("handles mixed inventory (existing, new, ignored, unknown)", async () => {
      const existingId = new ObjectId();
      const newInsertedId = new ObjectId();

      mockItemsCollection(
        {
          findOne: jest.fn().mockImplementation((query: any) => {
            // Return the existing Archwing mod for uniqueName key lookups;
            // everything else (Grinlok, unknown, name-based fallbacks) → null.
            if (query?.uniqueName === "/Lotus/Upgrades/Mods/Archwing/Rifle/Expert/ArchwingRifleAmmoMaxModExpert") {
              return Promise.resolve({ _id: existingId });
            }
            return Promise.resolve(null);
          }),
          insertOne: jest.fn().mockResolvedValue({ insertedId: newInsertedId }),
        },
        // Batch find result: only the Archwing mod is already in DB
        [{ uniqueName: "/Lotus/Upgrades/Mods/Archwing/Rifle/Expert/ArchwingRifleAmmoMaxModExpert" }]
      );
      mockUnknownItemsCollection();

      const result = await resolveBaroInventory([
        inventoryEntry(), // Archwing Rifle Ammo Max → existing
        inventoryEntry({ item: "Prisma Grinlok", uniqueName: "/Lotus/Weapons/Tenno/Rifle/PrismaGrinlok" }), // new via wfcd
        inventoryEntry({ item: "Void Surplus", uniqueName: "/Void" }), // ignored
        inventoryEntry({ item: "Alien Widget", uniqueName: "/Lotus/X/Y/Z/NoMatchHere" }), // unknown
      ]);

      expect(result.inventoryIds).toHaveLength(2);
      expect(result.ignoredItems).toContain("Void Surplus");
      expect(result.unmatchedItems).toContain("Alien Widget");
    });

    // ── Mod image generation (new Baro mod items) ──────────────────────────

    describe("mod image generation for new mod items", () => {
      // ArchwingRifleAmmoMaxModExpert is a Mod — the wfcd mock gives it category: "Mods"
      const modEntry = () => inventoryEntry();

      beforeEach(() => {
        // Default: generate returns a fake PNG buffer
        mockGenerate.mockResolvedValue(Buffer.from("fake-png-data") as any);
        mockStoreTempModImage.mockResolvedValue(undefined);
      });

      it("inserts the new mod item with MOD_IMAGE_SENTINEL as its image", async () => {
        const insertedId = new ObjectId();
        const col = mockItemsCollection({
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId }),
        });
        mockUnknownItemsCollection();

        await resolveBaroInventory([modEntry()]);

        const insertedDoc = col.insertOne.mock.calls[0][0];
        expect(insertedDoc.wikiImageLink).toBe("temp:modImage");
      });

      it("calls generate with the wfcd item data when a new mod is inserted", async () => {
        const insertedId = new ObjectId();
        mockItemsCollection({
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId }),
        });
        mockUnknownItemsCollection();

        await resolveBaroInventory([modEntry()]);

        expect(mockGenerate).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Archwing Rifle Ammo Max" }),
          0
        );
      });

      it("calls storeTempModImage with the inserted _id and the base64-encoded buffer", async () => {
        const insertedId = new ObjectId();
        const fakeBuffer = Buffer.from("fake-png-data");
        mockGenerate.mockResolvedValue(fakeBuffer as any);
        mockItemsCollection({
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId }),
        });
        mockUnknownItemsCollection();

        await resolveBaroInventory([modEntry()]);

        expect(mockStoreTempModImage).toHaveBeenCalledWith(
          insertedId,
          fakeBuffer.toString("base64")
        );
      });

      it("does NOT call storeTempModImage when generate returns undefined", async () => {
        mockGenerate.mockResolvedValue(undefined as any);
        const insertedId = new ObjectId();
        mockItemsCollection({
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId }),
        });
        mockUnknownItemsCollection();

        await resolveBaroInventory([modEntry()]);

        expect(mockStoreTempModImage).not.toHaveBeenCalled();
      });

      it("does not throw and still returns the item id when generate fails", async () => {
        mockGenerate.mockRejectedValue(new Error("Canvas render failed"));
        const insertedId = new ObjectId();
        mockItemsCollection({
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId }),
        });
        mockUnknownItemsCollection();

        const result = await resolveBaroInventory([modEntry()]);

        expect(result.inventoryIds).toHaveLength(1);
        expect(result.inventoryIds[0]).toEqual(insertedId);
        expect(mockStoreTempModImage).not.toHaveBeenCalled();
      });

      it("does NOT generate an image for new non-mod items (e.g. weapons)", async () => {
        const insertedId = new ObjectId();
        mockItemsCollection({
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId }),
        });
        mockUnknownItemsCollection();

        // Prisma Grinlok: category "Weapons" — not a mod
        await resolveBaroInventory([
          inventoryEntry({
            item: "Prisma Grinlok",
            uniqueName: "/Lotus/Weapons/Tenno/Rifle/PrismaGrinlok",
          }),
        ]);

        expect(mockGenerate).not.toHaveBeenCalled();
        expect(mockStoreTempModImage).not.toHaveBeenCalled();
      });

      it("does NOT generate an image for a mod item that already exists in the DB", async () => {
        const existingId = new ObjectId();
        mockItemsCollection(
          { findOne: jest.fn().mockResolvedValue({ _id: existingId }) },
          // Batch find tells identifyNewItems this item already exists
          [{ uniqueName: "/Lotus/Upgrades/Mods/Archwing/Rifle/Expert/ArchwingRifleAmmoMaxModExpert" }]
        );
        mockUnknownItemsCollection();

        await resolveBaroInventory([modEntry()]);

        expect(mockGenerate).not.toHaveBeenCalled();
        expect(mockStoreTempModImage).not.toHaveBeenCalled();
      });
    });
  });
});
