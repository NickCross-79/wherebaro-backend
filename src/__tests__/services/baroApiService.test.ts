/**
 * Tests for baroApiService
 */
import { fetchBaroData, isBaroActive } from "../../services/baroApiService";

// ─── Mock global fetch ───────────────────────────────────────────────────────

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

// ─── Mock warframe-worldstate-parser via worldStateService ───────────────────

jest.mock("../../services/worldStateService");
import { fetchWorldStateTrader } from "../../services/worldStateService";
const mockFetchWorldStateTrader = fetchWorldStateTrader as jest.MockedFunction<typeof fetchWorldStateTrader>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baroResponse(overrides: Record<string, any> = {}) {
  return {
    id: "baro-1",
    activation: "2025-01-10T14:00:00.000Z",
    expiry: "2025-01-12T14:00:00.000Z",
    location: "Strata Relay",
    inventory: [
      { uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 },
    ],
    ...overrides,
  };
}

function okResponse(body: any) {
  return { ok: true, json: async () => body } as unknown as Response;
}

/** Build a mock WorldStateTrader result */
function worldStateTrader(overrides: Record<string, any> = {}) {
  return {
    id: "ws-baro-1",
    activation: "2025-01-10T14:00:00.000Z",
    expiry: "2025-01-12T14:00:00.000Z",
    character: "Baro Ki'Teer",
    location: "Larunda Relay (Mercury)",
    inventory: [
      { uniqueName: "/Lotus/StoreItems/Foo", item: "Primed Flow", ducats: 300, credits: 175000 },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("baroApiService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWorldStateTrader.mockReset();
  });

  // ── fetchBaroData (primary API) ────────────────────────────────────────────

  describe("fetchBaroData – primary API", () => {
    it("returns parsed Baro data from the primary API", async () => {
      const data = baroResponse();
      mockFetch.mockResolvedValueOnce(okResponse(data));

      const result = await fetchBaroData();

      expect(result.location).toBe("Strata Relay");
      expect(result.inventory).toHaveLength(1);
      expect(result.inventory[0].item).toBe("Primed Flow");
      expect(result.source).toBe("warframestat");
      expect(mockFetchWorldStateTrader).not.toHaveBeenCalled();
    });

    it("handles API returning an array (takes first element)", async () => {
      const data = baroResponse();
      mockFetch.mockResolvedValueOnce(okResponse([data]));

      const result = await fetchBaroData();
      expect(result.location).toBe("Strata Relay");
      expect(result.source).toBe("warframestat");
    });

    it("defaults inventory to empty array when missing (Baro not active)", async () => {
      // Baro not active — empty inventory is expected, no fallback triggered
      const data = baroResponse({
        inventory: undefined,
        activation: "2099-01-10T14:00:00.000Z",
        expiry: "2099-01-12T14:00:00.000Z",
      });
      mockFetch.mockResolvedValueOnce(okResponse(data));

      const result = await fetchBaroData();
      expect(result.inventory).toEqual([]);
      expect(result.source).toBe("warframestat");
      expect(mockFetchWorldStateTrader).not.toHaveBeenCalled();
    });
  });

  // ── fetchBaroData (fallback – primary failure) ─────────────────────────────

  describe("fetchBaroData – fallback on primary failure", () => {
    it("falls back to world state when primary API returns HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });
      mockFetchWorldStateTrader.mockResolvedValueOnce(worldStateTrader());

      const result = await fetchBaroData();

      expect(result.source).toBe("worldstate");
      expect(result.location).toBe("Larunda Relay (Mercury)");
      expect(result.inventory).toHaveLength(1);
      expect(result.inventory[0].item).toBe("Primed Flow");
      expect(mockFetchWorldStateTrader).toHaveBeenCalledTimes(1);
    });

    it("falls back to world state when primary API returns invalid data", async () => {
      mockFetch.mockResolvedValueOnce(okResponse([])); // invalid — empty array
      mockFetchWorldStateTrader.mockResolvedValueOnce(worldStateTrader());

      const result = await fetchBaroData();

      expect(result.source).toBe("worldstate");
      expect(mockFetchWorldStateTrader).toHaveBeenCalledTimes(1);
    });

    it("throws original error when both primary and fallback fail", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" });
      mockFetchWorldStateTrader.mockRejectedValueOnce(new Error("World state also down"));

      await expect(fetchBaroData()).rejects.toThrow("Warframestat API error: 503 Service Unavailable");
    });
  });

  // ── fetchBaroData (fallback – empty inventory) ─────────────────────────────

  describe("fetchBaroData – fallback on empty inventory", () => {
    it("falls back when primary returns active Baro with empty inventory", async () => {
      const activeBaro = baroResponse({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [],
      });
      mockFetch.mockResolvedValueOnce(okResponse(activeBaro));
      mockFetchWorldStateTrader.mockResolvedValueOnce(
        worldStateTrader({
          activation: new Date(Date.now() - 3600_000).toISOString(),
          expiry: new Date(Date.now() + 3600_000).toISOString(),
          inventory: [
            { uniqueName: "/Lotus/StoreItems/Bar", item: "Prisma Grinlok", ducats: 500, credits: 200000 },
          ],
        })
      );

      const result = await fetchBaroData();

      expect(result.source).toBe("worldstate");
      expect(result.inventory).toHaveLength(1);
      expect(result.inventory[0].item).toBe("Prisma Grinlok");
    });

    it("uses primary response when both return empty inventory for active Baro", async () => {
      const activeBaro = baroResponse({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [],
      });
      mockFetch.mockResolvedValueOnce(okResponse(activeBaro));
      mockFetchWorldStateTrader.mockResolvedValueOnce(
        worldStateTrader({
          activation: new Date(Date.now() - 3600_000).toISOString(),
          expiry: new Date(Date.now() + 3600_000).toISOString(),
          inventory: [],
        })
      );

      const result = await fetchBaroData();

      expect(result.source).toBe("warframestat");
      expect(result.inventory).toEqual([]);
    });

    it("uses primary response when fallback fails during empty-inventory check", async () => {
      const activeBaro = baroResponse({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [],
      });
      mockFetch.mockResolvedValueOnce(okResponse(activeBaro));
      mockFetchWorldStateTrader.mockRejectedValueOnce(new Error("World state error"));

      const result = await fetchBaroData();

      expect(result.source).toBe("warframestat");
      expect(result.inventory).toEqual([]);
    });
  });

  // ── fetchBaroData (world state response mapping) ───────────────────────────

  describe("fetchBaroData – world state response mapping", () => {
    it("correctly maps WorldStateTrader fields to BaroApiResponse", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" });
      mockFetchWorldStateTrader.mockResolvedValueOnce(
        worldStateTrader({
          id: "custom-id",
          activation: "2025-06-01T14:00:00.000Z",
          expiry: "2025-06-03T14:00:00.000Z",
          character: "Baro Ki'Teer",
          location: "Orcus Relay (Pluto)",
          inventory: [
            { uniqueName: "/Lotus/StoreItems/X", item: "Item A", ducats: 100, credits: 50000 },
            { uniqueName: "/Lotus/StoreItems/Y", item: "Item B", ducats: 200, credits: 75000 },
          ],
        })
      );

      const result = await fetchBaroData();

      expect(result.id).toBe("custom-id");
      expect(result.activation).toBe("2025-06-01T14:00:00.000Z");
      expect(result.expiry).toBe("2025-06-03T14:00:00.000Z");
      expect(result.character).toBe("Baro Ki'Teer");
      expect(result.location).toBe("Orcus Relay (Pluto)");
      expect(result.inventory).toHaveLength(2);
      expect(result.source).toBe("worldstate");
    });

    it("throws when world state fallback also fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" });
      mockFetchWorldStateTrader.mockRejectedValueOnce(new Error("No VoidTrader data found in world state"));

      await expect(fetchBaroData()).rejects.toThrow("Warframestat API error: 500 Error");
    });
  });

  // ── isBaroActive ───────────────────────────────────────────────────────────

  describe("isBaroActive", () => {
    const activation = "2025-01-10T14:00:00.000Z";
    const expiry = "2025-01-12T14:00:00.000Z";

    it("returns true when now is between activation and expiry", () => {
      const now = new Date("2025-01-11T00:00:00.000Z");
      expect(isBaroActive(activation, expiry, now)).toBe(true);
    });

    it("returns true at exact activation time", () => {
      const now = new Date("2025-01-10T14:00:00.000Z");
      expect(isBaroActive(activation, expiry, now)).toBe(true);
    });

    it("returns true at exact expiry time", () => {
      const now = new Date("2025-01-12T14:00:00.000Z");
      expect(isBaroActive(activation, expiry, now)).toBe(true);
    });

    it("returns false before activation", () => {
      const now = new Date("2025-01-09T00:00:00.000Z");
      expect(isBaroActive(activation, expiry, now)).toBe(false);
    });

    it("returns false after expiry", () => {
      const now = new Date("2025-01-13T00:00:00.000Z");
      expect(isBaroActive(activation, expiry, now)).toBe(false);
    });

    it("uses current time when now is not provided", () => {
      // Far future activation  → should be false
      expect(isBaroActive("2099-01-01T00:00:00.000Z", "2099-01-03T00:00:00.000Z")).toBe(false);
    });
  });
});
