/**
 * Tests for baroApiService
 */
import { fetchBaroData, isBaroActive } from "../../services/baroApiService";

// ─── Mock global fetch ───────────────────────────────────────────────────────

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("baroApiService", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── fetchBaroData ──────────────────────────────────────────────────────────

  describe("fetchBaroData", () => {
    it("returns parsed Baro data from the API", async () => {
      const data = baroResponse();
      mockFetch.mockResolvedValueOnce(okResponse(data));

      const result = await fetchBaroData();

      expect(result.location).toBe("Strata Relay");
      expect(result.inventory).toHaveLength(1);
      expect(result.inventory[0].item).toBe("Primed Flow");
    });

    it("handles API returning an array (takes first element)", async () => {
      const data = baroResponse();
      mockFetch.mockResolvedValueOnce(okResponse([data]));

      const result = await fetchBaroData();
      expect(result.location).toBe("Strata Relay");
    });

    it("defaults inventory to empty array when missing", async () => {
      const data = baroResponse({ inventory: undefined });
      mockFetch.mockResolvedValueOnce(okResponse(data));

      const result = await fetchBaroData();
      expect(result.inventory).toEqual([]);
    });

    it("throws when API returns non-OK status", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });

      await expect(fetchBaroData()).rejects.toThrow("Failed to fetch Baro data: 500 Internal Server Error");
    });

    it("throws when API returns invalid data (empty array)", async () => {
      mockFetch.mockResolvedValueOnce(okResponse([]));

      await expect(fetchBaroData()).rejects.toThrow("Invalid Baro data received from API");
    });

    it("throws when API returns null", async () => {
      mockFetch.mockResolvedValueOnce(okResponse(null));

      await expect(fetchBaroData()).rejects.toThrow("Invalid Baro data received from API");
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
