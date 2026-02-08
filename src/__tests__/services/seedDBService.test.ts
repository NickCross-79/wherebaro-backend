/**
 * Tests for seedDBService
 */
import { insertBaroItems } from "../../services/seedDBService";
import Item from "../../models/Item";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("seedDBService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.items;
  });

  describe("insertBaroItems", () => {
    it("inserts array of items into the database", async () => {
      mockCollections.items = {
        insertMany: jest.fn().mockResolvedValue({ insertedCount: 2 }),
      };

      const items = [
        new Item("Primed Flow", "img.png", "/link", 175000, 300, "Mod", ["2024-01-10"], [], []),
        new Item("Prisma Grinlok", "grin.png", "/grin", 50000, 500, "Weapon", ["2024-02-20"], [], []),
      ];

      const result = await insertBaroItems(items);

      expect(result).toHaveLength(2);
      expect(mockCollections.items.insertMany).toHaveBeenCalledWith(items);
    });

    it("throws when items collection is not initialized", async () => {
      await expect(insertBaroItems([])).rejects.toThrow("Database collection not initialized");
    });
  });
});
