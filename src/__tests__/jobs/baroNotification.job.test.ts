/**
 * Tests for baroNotification.job
 */
import { checkBaroArrival, checkBaroDepartingSoon, checkBaroDeparture } from "../../jobs/baroNotification.job";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../services/baroApiService", () => ({
  fetchBaroData: jest.fn(),
}));

jest.mock("../../services/notificationService", () => ({
  sendBaroArrivalNotification: jest.fn(),
  sendBaroDepartingSoonNotification: jest.fn(),
  sendBaroDepartureNotification: jest.fn(),
  sendWishlistMatchNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../../services/wishlistService", () => ({
  getWishlistMatchesForCurrentInventory: jest.fn().mockResolvedValue(new Map()),
}));

import { fetchBaroData } from "../../services/baroApiService";
import {
  sendBaroArrivalNotification,
  sendBaroDepartingSoonNotification,
  sendBaroDepartureNotification,
  sendWishlistMatchNotification,
} from "../../services/notificationService";
import { getWishlistMatchesForCurrentInventory } from "../../services/wishlistService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockSendArrival = sendBaroArrivalNotification as jest.Mock;
const mockSendDepartingSoon = sendBaroDepartingSoonNotification as jest.Mock;
const mockSendDeparture = sendBaroDepartureNotification as jest.Mock;
const mockSendWishlist = sendWishlistMatchNotification as jest.Mock;
const mockGetWishlistMatches = getWishlistMatchesForCurrentInventory as jest.Mock;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baroData(overrides: Record<string, any> = {}) {
  return {
    activation: "2025-01-10T14:00:00.000Z",
    expiry: "2025-01-12T14:00:00.000Z",
    location: "Strata Relay",
    inventory: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("baroNotification.job", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── checkBaroArrival ───────────────────────────────────────────────────────

  describe("checkBaroArrival", () => {
    it("sends arrival notification when Baro is active", async () => {
      // Set activation in the past, expiry in the future
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() - 3600 * 1000).toISOString(),
          expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
          location: "Orcus Relay",
        })
      );

      const result = await checkBaroArrival();

      expect(result.notificationSent).toBe(true);
      expect(mockSendArrival).toHaveBeenCalledWith("Orcus Relay");
    });

    it("does not send notification when Baro is not active", async () => {
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() + 86400 * 1000).toISOString(),
          expiry: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
        })
      );

      const result = await checkBaroArrival();

      expect(result.notificationSent).toBe(false);
      expect(mockSendArrival).not.toHaveBeenCalled();
    });

    it("sends wishlist notifications after arrival notification", async () => {
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() - 3600 * 1000).toISOString(),
          expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
      );

      const wishlistMap = new Map<string, string[]>([
        ["token-A", ["Primed Flow"]],
        ["token-B", ["Prisma Grinlok", "Primed Flow"]],
      ]);
      mockGetWishlistMatches.mockResolvedValue(wishlistMap);

      await checkBaroArrival();

      expect(mockSendWishlist).toHaveBeenCalledTimes(2);
      expect(mockSendWishlist).toHaveBeenCalledWith("token-A", ["Primed Flow"]);
      expect(mockSendWishlist).toHaveBeenCalledWith("token-B", ["Prisma Grinlok", "Primed Flow"]);
    });

    it("does not fail if wishlist notification sending throws", async () => {
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() - 3600 * 1000).toISOString(),
          expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
      );
      mockGetWishlistMatches.mockRejectedValue(new Error("DB error"));

      const result = await checkBaroArrival();
      expect(result.notificationSent).toBe(true); // Main notification still went through
    });

    it("throws when fetchBaroData fails", async () => {
      mockFetchBaroData.mockRejectedValue(new Error("API down"));
      await expect(checkBaroArrival()).rejects.toThrow("API down");
    });
  });

  // ── checkBaroDepartingSoon ─────────────────────────────────────────────────

  describe("checkBaroDepartingSoon", () => {
    it("sends departing-soon notification when Baro is still active", async () => {
      const threeHoursLater = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() - 86400 * 1000).toISOString(),
          expiry: threeHoursLater,
        })
      );

      const result = await checkBaroDepartingSoon();

      expect(result.notificationSent).toBe(true);
      expect(mockSendDepartingSoon).toHaveBeenCalledWith(expect.any(Number));
    });

    it("does not send notification when Baro is not active", async () => {
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() + 86400 * 1000).toISOString(),
          expiry: new Date(Date.now() + 2 * 86400 * 1000).toISOString(),
        })
      );

      const result = await checkBaroDepartingSoon();

      expect(result.notificationSent).toBe(false);
      expect(mockSendDepartingSoon).not.toHaveBeenCalled();
    });

    it("throws when fetchBaroData fails", async () => {
      mockFetchBaroData.mockRejectedValue(new Error("API down"));
      await expect(checkBaroDepartingSoon()).rejects.toThrow("API down");
    });
  });

  // ── checkBaroDeparture ─────────────────────────────────────────────────────

  describe("checkBaroDeparture", () => {
    it("sends departure notification when Baro just left (next arrival > 7 days away)", async () => {
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() + 14 * 86400 * 1000).toISOString(), // 14 days away
          expiry: new Date(Date.now() + 16 * 86400 * 1000).toISOString(),
        })
      );

      const result = await checkBaroDeparture();

      expect(result.notificationSent).toBe(true);
      expect(mockSendDeparture).toHaveBeenCalled();
    });

    it("does not send when Baro is still active", async () => {
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() - 3600 * 1000).toISOString(),
          expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
      );

      const result = await checkBaroDeparture();

      expect(result.notificationSent).toBe(false);
      expect(mockSendDeparture).not.toHaveBeenCalled();
    });

    it("does not send when next arrival is within 7 days (Baro wasn't here)", async () => {
      mockFetchBaroData.mockResolvedValue(
        baroData({
          activation: new Date(Date.now() + 5 * 86400 * 1000).toISOString(), // 5 days away
          expiry: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
        })
      );

      const result = await checkBaroDeparture();

      expect(result.notificationSent).toBe(false);
      expect(mockSendDeparture).not.toHaveBeenCalled();
    });

    it("throws when fetchBaroData fails", async () => {
      mockFetchBaroData.mockRejectedValue(new Error("API down"));
      await expect(checkBaroDeparture()).rejects.toThrow("API down");
    });
  });
});
