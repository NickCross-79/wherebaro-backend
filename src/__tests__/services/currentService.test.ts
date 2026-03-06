/**
 * Tests for currentService
 */
import { ObjectId } from "mongodb";
import { fetchCurrent, upsertCurrent } from "../../services/currentService";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupCollections(currentData: any = null, itemsData: any[] = []) {
  mockCollections.current = {
    findOne: jest.fn().mockResolvedValue(currentData),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
  };
  mockCollections.items = {
    find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(itemsData) }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("currentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.current;
    delete mockCollections.items;
  });

  // ── fetchCurrent ───────────────────────────────────────────────────────────

  describe("fetchCurrent", () => {
    it("returns default inactive state when no record exists", async () => {
      setupCollections(null);

      const result = await fetchCurrent();

      expect(result.isActive).toBe(false);
      expect(result.items).toEqual([]);
    });

    it("returns inactive state from DB record with no inventory", async () => {
      setupCollections({
        isActive: false,
        activation: "2025-01-10T14:00:00.000Z",
        expiry: "2025-01-12T14:00:00.000Z",
        location: "Strata Relay",
        inventory: [],
      });

      const result = await fetchCurrent();

      expect(result.isActive).toBe(false);
      expect(result.location).toBe("Strata Relay");
      expect(result.items).toEqual([]);
    });

    it("populates inventory with full item objects when Baro is active", async () => {
      const itemId = new ObjectId();
      const fullItem = { _id: itemId, name: "Primed Flow", type: "Mod" };

      setupCollections(
        {
          isActive: true,
          activation: "2025-01-10T14:00:00.000Z",
          expiry: "2025-01-12T14:00:00.000Z",
          location: "Strata Relay",
          inventory: [itemId],
        },
        [fullItem]
      );

      const result = await fetchCurrent();

      expect(result.isActive).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Primed Flow");
    });

    it("handles string item IDs in inventory (converts to ObjectId)", async () => {
      const itemId = new ObjectId();
      const fullItem = { _id: itemId, name: "Primed Flow" };

      setupCollections(
        {
          isActive: true,
          activation: "2025-01-10T14:00:00.000Z",
          expiry: "2025-01-12T14:00:00.000Z",
          location: "Strata Relay",
          inventory: [itemId.toHexString()],
        },
        [fullItem]
      );

      const result = await fetchCurrent();
      expect(result.isActive).toBe(true);
      expect(result.items).toHaveLength(1);
    });

    it("throws when current collection is not initialized", async () => {
      await expect(fetchCurrent()).rejects.toThrow("Current collection not initialized");
    });
  });

  // ── upsertCurrent ───────────────────────────────────────────────────────────

  describe("upsertCurrent", () => {
    it("stores inactive status with empty inventory", async () => {
      setupCollections();

      await upsertCurrent(false, "2025-01-10T14:00:00.000Z", "2025-01-12T14:00:00.000Z", "Strata Relay");

      expect(mockCollections.current.updateOne).toHaveBeenCalledWith(
        {},
        {
          $set: {
            isActive: false,
            activation: "2025-01-10T14:00:00.000Z",
            expiry: "2025-01-12T14:00:00.000Z",
            location: "Strata Relay",
            inventory: [],
          },
        },
        { upsert: true }
      );
    });

    it("stores active status with resolved inventory IDs", async () => {
      setupCollections();
      const resolvedIds = [new ObjectId(), new ObjectId()];

      await upsertCurrent(true, "2025-01-10T14:00:00.000Z", "2025-01-12T14:00:00.000Z", "Strata Relay", resolvedIds);

      expect(mockCollections.current.updateOne).toHaveBeenCalledWith(
        {},
        {
          $set: {
            isActive: true,
            activation: "2025-01-10T14:00:00.000Z",
            expiry: "2025-01-12T14:00:00.000Z",
            location: "Strata Relay",
            inventory: resolvedIds,
          },
        },
        { upsert: true }
      );
    });

    it("defaults empty location to empty string", async () => {
      setupCollections();

      await upsertCurrent(true, "2025-01-10T14:00:00.000Z", "2025-01-12T14:00:00.000Z", "");

      const call = mockCollections.current.updateOne.mock.calls[0];
      expect(call[1].$set.location).toBe("");
    });

    it("throws when current collection is not initialized", async () => {
      // Don't setup collections
      await expect(
        upsertCurrent(false, "2025-01-10T14:00:00.000Z", "2025-01-12T14:00:00.000Z", "Strata Relay")
      ).rejects.toThrow("Current collection not initialized");
    });
  });
});
