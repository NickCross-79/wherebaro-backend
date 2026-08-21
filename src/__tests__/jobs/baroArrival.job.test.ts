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
  isStaleCycle: jest.fn((expiry: string) => new Date(expiry) <= new Date()),
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
  markArrivalNotified: jest.fn().mockResolvedValue(undefined),
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
import { upsertCurrent, markArrivalNotified } from "../../services/currentService";
import {
  sendBaroArrivalNotification,
  sendWishlistMatchNotification,
} from "../../services/notificationService";
import { getWishlistMatchesForCurrentInventory } from "../../services/wishlistService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockResolve = resolveBaroInventory as jest.Mock;
const mockUpsert = upsertCurrent as jest.Mock;
const mockMarkNotified = markArrivalNotified as jest.Mock;
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

  it("retries fetch when active but empty, and succeeds when inventory arrives on 2nd attempt", async () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    const activeInventory = [{ uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 }];

    mockFetchBaroData
      .mockResolvedValueOnce(
        baroData({
          activation: new Date(Date.now() - 3600_000).toISOString(),
          expiry: new Date(Date.now() + 3600_000).toISOString(),
          inventory: [],
        })
      )
      .mockResolvedValueOnce(
        baroData({
          activation: new Date(Date.now() - 3600_000).toISOString(),
          expiry: new Date(Date.now() + 3600_000).toISOString(),
          inventory: activeInventory,
        })
      );

    const resultPromise = baroArrivalJob();
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    jest.useRealTimers();

    expect(result.isActive).toBe(true);
    expect(result.inventoryCount).toBe(1);
    expect(result.notificationSent).toBe(true);
    expect(mockFetchBaroData).toHaveBeenCalledTimes(2);
    expect(mockResolve).toHaveBeenCalled();
  });

  it("retries when the API is still serving last visit's cycle, then notifies once it flips", async () => {
    // The missed-arrival regression. At Baro's activation instant every upstream
    // source still reports the previous visit, so he reads as absent. This used
    // to return on the first attempt and skip the arrival entirely — storing
    // isActive:false and never sending a notification.
    jest.useFakeTimers({ doNotFake: ["Date"] });
    const inventory = [{ uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 }];

    mockFetchBaroData
      .mockResolvedValueOnce(
        baroData({
          activation: new Date(Date.now() - 14 * 86400_000).toISOString(),
          expiry: new Date(Date.now() - 12 * 86400_000).toISOString(),
          inventory: [],
        })
      )
      .mockResolvedValueOnce(
        baroData({
          activation: new Date(Date.now() - 60_000).toISOString(),
          expiry: new Date(Date.now() + 47 * 3600_000).toISOString(),
          location: "Orcus Relay (Pluto)",
          inventory,
        })
      );

    const resultPromise = baroArrivalJob();
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    jest.useRealTimers();

    expect(result.isActive).toBe(true);
    expect(result.notificationSent).toBe(true);
    expect(result.inventoryCount).toBe(1);
    expect(mockFetchBaroData).toHaveBeenCalledTimes(2);
    expect(mockSendArrival).toHaveBeenCalledWith("Orcus Relay (Pluto)");
    expect(mockMarkNotified).toHaveBeenCalled();
  });

  it("does NOT retry on an off-week when Baro is genuinely between visits", async () => {
    // Baro is biweekly, so most Fridays this job legitimately finds nobody home.
    // The next cycle is already published (expiry in the future), which is the
    // signal that "absent" is the truth rather than upstream lag.
    jest.useFakeTimers({ doNotFake: ["Date"] });
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() + 5 * 86400_000).toISOString(),
        expiry: new Date(Date.now() + 7 * 86400_000).toISOString(),
        inventory: [],
      })
    );

    const resultPromise = baroArrivalJob();
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    jest.useRealTimers();

    expect(result.isActive).toBe(false);
    expect(result.notificationSent).toBe(false);
    expect(mockFetchBaroData).toHaveBeenCalledTimes(1);
    expect(mockSendArrival).not.toHaveBeenCalled();
    expect(mockMarkNotified).not.toHaveBeenCalled();
  });

  it("records the notified cycle so the reconcile job will not re-notify", async () => {
    const activation = new Date(Date.now() - 3600_000).toISOString();
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation,
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [{ uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 }],
      })
    );

    await baroArrivalJob();

    expect(mockMarkNotified).toHaveBeenCalledWith(activation);
  });

  it("handles active Baro with empty inventory after all retries exhausted (still notifies)", async () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
        inventory: [],
      })
    );

    const resultPromise = baroArrivalJob();
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    jest.useRealTimers();

    expect(result.isActive).toBe(true);
    expect(result.notificationSent).toBe(true);
    expect(result.inventoryCount).toBe(0);
    expect(mockFetchBaroData).toHaveBeenCalledTimes(31); // 30 retry attempts + 1 final call
    expect(mockResolve).not.toHaveBeenCalled();
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
