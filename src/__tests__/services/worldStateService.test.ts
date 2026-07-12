/**
 * Tests for worldStateService
 */

// Avoid loading the full @wfcd/items dataset — identity mappers are enough here
jest.mock("../../utils/wfcdItems", () => ({
  normalizeItemType: (s: string) => s,
  resolveItemName: (s: string) => s,
}));

import { fetchWorldStateTrader } from "../../services/worldStateService";

// ─── Mock global fetch ───────────────────────────────────────────────────────

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a raw world-state VoidTrader entry */
function rawTrader(overrides: Record<string, any> = {}) {
  return {
    _id: { $oid: "regular-baro-id" },
    Activation: { $date: { $numberLong: "1752246000000" } },
    Expiry: { $date: { $numberLong: "1752418800000" } },
    Character: "Baro'Ki Teel",
    Node: "SaturnHUB",
    Manifest: [
      { ItemType: "/Lotus/StoreItems/Foo", PrimePrice: 300, RegularPrice: 175000 },
    ],
    ...overrides,
  };
}

function okWorldState(voidTraders: any[]) {
  return { ok: true, json: async () => ({ VoidTraders: voidTraders }) } as unknown as Response;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fetchWorldStateTrader", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns the regular relay trader with a resolved relay name", async () => {
    mockFetch.mockResolvedValueOnce(okWorldState([rawTrader()]));

    const trader = await fetchWorldStateTrader();

    expect(trader.id).toBe("regular-baro-id");
    expect(trader.location).toBe("Kronia Relay (Saturn)");
    expect(trader.inventory).toHaveLength(1);
    expect(trader.inventory[0].ducats).toBe(300);
    expect(trader.inventory[0].credits).toBe(175000);
  });

  it("skips the TennoCon trader when it appears first (TennoCon weekend)", async () => {
    const tennocon = rawTrader({ _id: { $oid: "tennocon-baro-id" }, Node: "TennoConHUB2" });
    mockFetch.mockResolvedValueOnce(okWorldState([tennocon, rawTrader()]));

    const trader = await fetchWorldStateTrader();

    expect(trader.id).toBe("regular-baro-id");
    expect(trader.location).toBe("Kronia Relay (Saturn)");
  });

  it("throws when only the TennoCon trader is present", async () => {
    const tennocon = rawTrader({ _id: { $oid: "tennocon-baro-id" }, Node: "TennoConHUB2" });
    mockFetch.mockResolvedValueOnce(okWorldState([tennocon]));

    await expect(fetchWorldStateTrader()).rejects.toThrow(
      "No regular VoidTrader data found in world state"
    );
  });

  it("throws when the world state has no VoidTrader data", async () => {
    mockFetch.mockResolvedValueOnce(okWorldState([]));

    await expect(fetchWorldStateTrader()).rejects.toThrow(
      "No regular VoidTrader data found in world state"
    );
  });

  it("throws on HTTP error from the world state API", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });

    await expect(fetchWorldStateTrader()).rejects.toThrow(
      "World state API error: 500 Internal Server Error"
    );
  });
});
