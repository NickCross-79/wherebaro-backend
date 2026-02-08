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
      name: "Primed Flow",
      uniqueName: "/Lotus/Upgrades/Mods/Fusers/PrimedFlow",
      imageName: "primed-flow.png",
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockItemsCollection(overrides: Record<string, jest.Mock> = {}) {
  const col = {
    find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
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
    uniqueName: "/Lotus/Upgrades/Mods/Fusers/PrimedFlow",
    item: "Primed Flow",
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
    it("resolves existing items by uniqueName suffix match", async () => {
      const existingId = new ObjectId();
      const col = mockItemsCollection({
        findOne: jest.fn().mockResolvedValue({ _id: existingId }),
      });
      mockUnknownItemsCollection();

      const result = await resolveBaroInventory([inventoryEntry()]);

      expect(result.inventoryIds).toHaveLength(1);
      expect(result.inventoryIds[0]).toEqual(existingId);
      expect(col.updateOne).toHaveBeenCalledWith(
        { _id: existingId },
        { $addToSet: { offeringDates: expect.any(String) } }
      );
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
      let findOneCallCount = 0;

      mockItemsCollection({
        findOne: jest.fn().mockImplementation(() => {
          findOneCallCount++;
          // First call: found existing item. Second call: not found.
          // Third call: not found (mystery item not in wfcd).
          if (findOneCallCount === 1) return Promise.resolve({ _id: existingId });
          return Promise.resolve(null);
        }),
        insertOne: jest.fn().mockResolvedValue({ insertedId: newInsertedId }),
      });
      mockUnknownItemsCollection();

      const result = await resolveBaroInventory([
        inventoryEntry(), // Primed Flow → existing
        inventoryEntry({ item: "Prisma Grinlok", uniqueName: "/Lotus/Weapons/Tenno/Rifle/PrismaGrinlok" }), // new via wfcd
        inventoryEntry({ item: "Void Surplus", uniqueName: "/Void" }), // ignored
        inventoryEntry({ item: "Alien Widget", uniqueName: "/Lotus/X/Y/Z/NoMatchHere" }), // unknown
      ]);

      expect(result.inventoryIds).toHaveLength(2);
      expect(result.ignoredItems).toContain("Void Surplus");
      expect(result.unmatchedItems).toContain("Alien Widget");
    });
  });
});
