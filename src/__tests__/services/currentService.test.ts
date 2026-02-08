/**
 * Tests for currentService
 */
import { ObjectId } from "mongodb";
import { fetchCurrent, updateCurrentFromApi } from "../../services/currentService";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  collections: {},
}));

import { collections } from "../../db/database.service";
const mockCollections = collections as Record<string, any>;

jest.mock("../../services/baroApiService", () => ({
  fetchBaroData: jest.fn(),
  isBaroActive: jest.fn(),
}));

jest.mock("../../services/itemService", () => ({
  resolveBaroInventory: jest.fn(),
}));

import { fetchBaroData, isBaroActive } from "../../services/baroApiService";
import { resolveBaroInventory } from "../../services/itemService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockIsBaroActive = isBaroActive as jest.Mock;
const mockResolveBaroInventory = resolveBaroInventory as jest.Mock;

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

function baroApiData(overrides: Record<string, any> = {}) {
  return {
    activation: "2025-01-10T14:00:00.000Z",
    expiry: "2025-01-12T14:00:00.000Z",
    location: "Strata Relay",
    inventory: [{ uniqueName: "/Foo", item: "Primed Flow", ducats: 300, credits: 175000 }],
    ...overrides,
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

  // ── updateCurrentFromApi ───────────────────────────────────────────────────

  describe("updateCurrentFromApi", () => {
    it("stores inactive status when Baro is absent", async () => {
      const baro = baroApiData({ inventory: [] });
      mockFetchBaroData.mockResolvedValue(baro);
      mockIsBaroActive.mockReturnValue(false);
      setupCollections();

      const result = await updateCurrentFromApi();

      expect(result.isActive).toBe(false);
      expect(mockCollections.current.updateOne).toHaveBeenCalledWith(
        {},
        {
          $set: expect.objectContaining({
            isActive: false,
            location: "Strata Relay",
          }),
        },
        { upsert: true }
      );
    });

    it("stores active status with resolved inventory IDs when Baro is here", async () => {
      const baro = baroApiData();
      mockFetchBaroData.mockResolvedValue(baro);
      mockIsBaroActive.mockReturnValue(true);

      const resolvedIds = [new ObjectId(), new ObjectId()];
      mockResolveBaroInventory.mockResolvedValue({
        inventoryIds: resolvedIds,
        unmatchedItems: [],
        ignoredItems: [],
      });
      setupCollections();

      const result = await updateCurrentFromApi();

      expect(result.isActive).toBe(true);
      expect(result.inventoryCount).toBe(2);
      expect(mockCollections.current.updateOne).toHaveBeenCalledWith(
        {},
        {
          $set: expect.objectContaining({
            isActive: true,
            inventory: resolvedIds,
          }),
        },
        { upsert: true }
      );
    });

    it("handles Baro active with empty inventory", async () => {
      const baro = baroApiData({ inventory: [] });
      mockFetchBaroData.mockResolvedValue(baro);
      mockIsBaroActive.mockReturnValue(true);
      setupCollections();

      const result = await updateCurrentFromApi();

      expect(result.isActive).toBe(true);
      expect(result.inventoryCount).toBe(0);
    });

    it("reports unmatched items from resolveBaroInventory", async () => {
      const baro = baroApiData();
      mockFetchBaroData.mockResolvedValue(baro);
      mockIsBaroActive.mockReturnValue(true);
      mockResolveBaroInventory.mockResolvedValue({
        inventoryIds: [],
        unmatchedItems: ["Mystery Widget"],
        ignoredItems: [],
      });
      setupCollections();

      const result = await updateCurrentFromApi();
      expect(result.unmatchedItems).toContain("Mystery Widget");
    });

    it("throws when current collection is not initialized", async () => {
      mockFetchBaroData.mockResolvedValue(baroApiData());
      mockIsBaroActive.mockReturnValue(false);
      // Don't setup collections

      await expect(updateCurrentFromApi()).rejects.toThrow("Current collection not initialized");
    });
  });
});
