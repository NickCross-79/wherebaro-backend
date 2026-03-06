/**
 * Tests for baroDepartingSoon.job — Sunday morning warning
 */
import { baroDepartingSoonJob } from "../../jobs/baroDepartingSoon.job";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../services/baroApiService", () => ({
  fetchBaroData: jest.fn(),
  isBaroActive: jest.fn((activation: string, expiry: string) => {
    const now = new Date();
    return now >= new Date(activation) && now <= new Date(expiry);
  }),
}));

jest.mock("../../services/notificationService", () => ({
  sendBaroDepartingSoonNotification: jest.fn().mockResolvedValue(undefined),
}));

import { fetchBaroData } from "../../services/baroApiService";
import { sendBaroDepartingSoonNotification } from "../../services/notificationService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockSendDepartingSoon = sendBaroDepartingSoonNotification as jest.Mock;

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

describe("baroDepartingSoon.job", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends departing-soon notification when Baro is still active", async () => {
    const threeHoursLater = new Date(Date.now() + 3 * 3600_000).toISOString();
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() - 86400_000).toISOString(),
        expiry: threeHoursLater,
      })
    );

    const result = await baroDepartingSoonJob();

    expect(result.notificationSent).toBe(true);
    expect(result.hoursLeft).toEqual(expect.any(Number));
    expect(mockSendDepartingSoon).toHaveBeenCalledWith(expect.any(Number));
  });

  it("does not send notification when Baro is not active", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() + 86400_000).toISOString(),
        expiry: new Date(Date.now() + 2 * 86400_000).toISOString(),
      })
    );

    const result = await baroDepartingSoonJob();

    expect(result.notificationSent).toBe(false);
    expect(mockSendDepartingSoon).not.toHaveBeenCalled();
  });

  it("throws when fetchBaroData fails", async () => {
    mockFetchBaroData.mockRejectedValue(new Error("API down"));
    await expect(baroDepartingSoonJob()).rejects.toThrow("API down");
  });
});
