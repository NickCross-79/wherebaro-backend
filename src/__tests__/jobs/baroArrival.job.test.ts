/**
 * Tests for baroArrival.job — Friday orchestrator
 */
import { baroArrivalJob } from "../../jobs/baroArrival.job";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../services/baroApiService", () => ({
  fetchBaroData: jest.fn(),
  isBaroActive: jest.fn((activation: string, expiry: string) => {
    const now = new Date();
    return now >= new Date(activation) && now <= new Date(expiry);
  }),
}));

jest.mock("../../services/itemService", () => ({
  resolveBaroInventory: jest.fn().mockResolvedValue({
    inventoryIds: [{ toHexString: () => "aaa" }],
    unmatchedItems: [],
    ignoredItems: [],
  }),
}));

jest.mock("../../services/currentService", () => ({
  upsertCurrent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/notificationService", () => ({
  sendBaroArrivalNotification: jest.fn().mockResolvedValue(undefined),
  sendWishlistMatchNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../../services/wishlistService", () => ({
  getWishlistMatchesForCurrentInventory: jest.fn().mockResolvedValue(new Map()),
}));

import { fetchBaroData } from "../../services/baroApiService";
import { resolveBaroInventory } from "../../services/itemService";
import { upsertCurrent } from "../../services/currentService";
import {
  sendBaroArrivalNotification,
  sendWishlistMatchNotification,
} from "../../services/notificationService";
import { getWishlistMatchesForCurrentInventory } from "../../services/wishlistService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockResolve = resolveBaroInventory as jest.Mock;
const mockUpsert = upsertCurrent as jest.Mock;
const mockSendArrival = sendBaroArrivalNotification as jest.Mock;
const mockSendWishlist = sendWishlistMatchNotification as jest.Mock;
const mockGetWishlist = getWishlistMatchesForCurrentInventory as jest.Mock;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baroData(overrides: Record<string, any> = {}) {
  return {
    activation: "2025-01-10T14:00:00.000Z",
    expiry: "2025-01-12T14:00:00.000Z",
    location: "Strata Relay",
    inventory: [],
    source: "warframestat",
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("baroArrival.job", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores inactive status when Baro is absent (no notification)", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() + 86400_000).toISOString(),
        expiry: new Date(Date.now() + 2 * 86400_000).toISOString(),
      })
    );

    const result = await baroArrivalJob();

    expect(result.isActive).toBe(false);
    expect(result.notificationSent).toBe(false);
    expect(mockUpsert).toHaveBeenCalledWith(false, expect.any(String), expect.any(String), "Strata Relay");
    expect(mockSendArrival).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("orchestrates full flow when Baro is active: resolve → upsert → notify", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        location: "Orcus Relay",
        inventory: [{ uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 }],
      })
    );

    const result = await baroArrivalJob();

    expect(result.isActive).toBe(true);
    expect(result.notificationSent).toBe(true);
    expect(mockResolve).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(true, expect.any(String), expect.any(String), "Orcus Relay", expect.any(Array));
    expect(mockSendArrival).toHaveBeenCalledWith("Orcus Relay");
  });

  it("handles active Baro with empty inventory (still notifies)", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [],
      })
    );

    const result = await baroArrivalJob();

    expect(result.isActive).toBe(true);
    expect(result.notificationSent).toBe(true);
    expect(result.inventoryCount).toBe(0);
    expect(mockResolve).not.toHaveBeenCalled(); // No inventory to resolve
    expect(mockSendArrival).toHaveBeenCalled();
  });

  it("sends wishlist notifications after arrival notification", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [{ uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 }],
      })
    );

    const wishlistMap = new Map<string, string[]>([
      ["token-A", ["Primed Flow"]],
      ["token-B", ["Prisma Grinlok", "Primed Flow"]],
    ]);
    mockGetWishlist.mockResolvedValue(wishlistMap);

    const result = await baroArrivalJob();

    expect(mockSendWishlist).toHaveBeenCalledTimes(2);
    expect(mockSendWishlist).toHaveBeenCalledWith("token-A", ["Primed Flow"]);
    expect(mockSendWishlist).toHaveBeenCalledWith("token-B", ["Prisma Grinlok", "Primed Flow"]);
    expect(result.wishlistSent).toBe(2);
  });

  it("does not fail if wishlist notification sending throws", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [{ uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 }],
      })
    );
    mockGetWishlist.mockRejectedValue(new Error("DB error"));

    const result = await baroArrivalJob();
    expect(result.notificationSent).toBe(true); // Main notification still went through
  });

  it("throws when fetchBaroData fails", async () => {
    mockFetchBaroData.mockRejectedValue(new Error("API down"));
    await expect(baroArrivalJob()).rejects.toThrow("API down");
  });
});
