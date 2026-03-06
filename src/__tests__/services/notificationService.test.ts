/**
 * Tests for notificationService
 */
import {
  sendPushNotifications,
  sendBaroArrivalNotification,
  sendBaroDepartingSoonNotification,
  sendBaroDepartureNotification,
  sendWishlistMatchNotification,
} from "../../services/notificationService";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("expo-server-sdk", () => {
  const sendFn = jest.fn();
  const chunkFn = jest.fn((msgs: any[]) => [msgs]);
  const isTokenFn = jest.fn().mockReturnValue(true);

  return {
    Expo: Object.assign(
      jest.fn().mockImplementation(() => ({
        sendPushNotificationsAsync: sendFn,
        chunkPushNotifications: chunkFn,
      })),
      { isExpoPushToken: (...args: any[]) => isTokenFn(...args) }
    ),
    __sendFn: sendFn,
    __chunkFn: chunkFn,
    __isTokenFn: isTokenFn,
  };
});

jest.mock("../../services/pushTokenService", () => ({
  getActivePushTokens: jest.fn().mockResolvedValue([]),
  deactivatePushToken: jest.fn(),
}));

const { __sendFn: mockSendPushNotificationsAsync, __chunkFn: mockChunkPushNotifications, __isTokenFn: mockIsExpoPushToken } =
  jest.requireMock("expo-server-sdk") as any;

import { getActivePushTokens, deactivatePushToken } from "../../services/pushTokenService";
const mockGetActiveTokens = getActivePushTokens as jest.Mock;
const mockDeactivateToken = deactivatePushToken as jest.Mock;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("notificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsExpoPushToken.mockReturnValue(true);
  });

  // ── sendPushNotifications ──────────────────────────────────────────────────

  describe("sendPushNotifications", () => {
    it("sends notifications to all active tokens", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-1", "token-2"]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: "ok", id: "receipt-1" },
        { status: "ok", id: "receipt-2" },
      ]);

      const result = await sendPushNotifications("Title", "Body");

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("returns early when no active tokens exist", async () => {
      mockGetActiveTokens.mockResolvedValue([]);
      const result = await sendPushNotifications("Title", "Body");

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
    });

    it("deactivates tokens that get DeviceNotRegistered error", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-bad"]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: "error", message: "Device not registered", details: { error: "DeviceNotRegistered" } },
      ]);

      const result = await sendPushNotifications("Title", "Body");

      expect(result.failed).toBe(1);
      expect(mockDeactivateToken).toHaveBeenCalledWith("token-bad");
    });

    it("does NOT deactivate tokens for non-DeviceNotRegistered errors", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-ok"]);
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: "error", message: "Some server error", details: { error: "MessageTooBig" } },
      ]);

      await sendPushNotifications("Title", "Body");
      expect(mockDeactivateToken).not.toHaveBeenCalled();
    });

    it("skips and deactivates invalid Expo push tokens", async () => {
      mockGetActiveTokens.mockResolvedValue(["invalid-token"]);
      mockIsExpoPushToken.mockReturnValue(false);
      mockSendPushNotificationsAsync.mockResolvedValue([]);

      await sendPushNotifications("Title", "Body");

      expect(mockDeactivateToken).toHaveBeenCalledWith("invalid-token");
    });

    it("passes data payload to notifications", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-1"]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

      await sendPushNotifications("T", "B", { type: "test" });

      const sentMessages = mockChunkPushNotifications.mock.calls[0][0];
      expect(sentMessages[0].data).toEqual({ type: "test" });
    });

    it("handles chunk send errors gracefully", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-1"]);
      mockSendPushNotificationsAsync.mockRejectedValue(new Error("Network error"));

      // Should not throw
      const result = await sendPushNotifications("Title", "Body");
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // ── sendBaroArrivalNotification ────────────────────────────────────────────

  describe("sendBaroArrivalNotification", () => {
    it("sends notification with Baro arrival title and location", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-1"]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

      await sendBaroArrivalNotification("Strata Relay");

      const sentMessages = mockChunkPushNotifications.mock.calls[0][0];
      expect(sentMessages[0].title).toContain("arrived");
      expect(sentMessages[0].body).toContain("Strata Relay");
      expect(sentMessages[0].data.type).toBe("baro-arrival");
    });
  });

  // ── sendBaroDepartingSoonNotification ──────────────────────────────────────

  describe("sendBaroDepartingSoonNotification", () => {
    it("sends notification with hours remaining", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-1"]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

      await sendBaroDepartingSoonNotification(3);

      const sentMessages = mockChunkPushNotifications.mock.calls[0][0];
      expect(sentMessages[0].title).toContain("leaving soon");
      expect(sentMessages[0].body).toContain("3");
      expect(sentMessages[0].data.type).toBe("baro-leaving-soon");
    });
  });

  // ── sendBaroDepartureNotification ──────────────────────────────────────────

  describe("sendBaroDepartureNotification", () => {
    it("sends departure notification", async () => {
      mockGetActiveTokens.mockResolvedValue(["token-1"]);
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

      await sendBaroDepartureNotification();

      const sentMessages = mockChunkPushNotifications.mock.calls[0][0];
      expect(sentMessages[0].title).toContain("departed");
      expect(sentMessages[0].data.type).toBe("baro-departure");
    });
  });

  // ── sendWishlistMatchNotification ──────────────────────────────────────────

  describe("sendWishlistMatchNotification", () => {
    it("sends single-item wishlist notification", async () => {
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

      const result = await sendWishlistMatchNotification("token-1", ["Primed Flow"]);

      expect(result.success).toBe(true);
      const sentMessage = mockSendPushNotificationsAsync.mock.calls[0][0][0];
      expect(sentMessage.title).toContain("an item");
      expect(sentMessage.body).toContain("Grab it");
      expect(sentMessage.data.items).toEqual(["Primed Flow"]);
    });

    it("sends multi-item wishlist notification", async () => {
      mockSendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }]);

      const result = await sendWishlistMatchNotification("token-1", ["Primed Flow", "Prisma Grinlok"]);

      expect(result.success).toBe(true);
      const sentMessage = mockSendPushNotificationsAsync.mock.calls[0][0][0];
      expect(sentMessage.title).toContain("2 items");
      expect(sentMessage.body).toContain("Grab them");
    });

    it("returns false for invalid push token", async () => {
      mockIsExpoPushToken.mockReturnValue(false);

      const result = await sendWishlistMatchNotification("bad-token", ["Item"]);

      expect(result.success).toBe(false);
      expect(mockDeactivateToken).toHaveBeenCalledWith("bad-token");
    });

    it("returns false when send fails with DeviceNotRegistered", async () => {
      mockSendPushNotificationsAsync.mockResolvedValue([
        { status: "error", message: "Not registered", details: { error: "DeviceNotRegistered" } },
      ]);

      const result = await sendWishlistMatchNotification("token-1", ["Item"]);

      expect(result.success).toBe(false);
      expect(mockDeactivateToken).toHaveBeenCalledWith("token-1");
    });

    it("returns false on unexpected error", async () => {
      mockSendPushNotificationsAsync.mockRejectedValue(new Error("Network error"));

      const result = await sendWishlistMatchNotification("token-1", ["Item"]);
      expect(result.success).toBe(false);
    });
  });
});
