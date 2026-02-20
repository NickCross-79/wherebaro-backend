/**
 * Tests for baroDeparture.job — Sunday departure check + DB update
 */
import { baroDepartureJob } from "../../jobs/baroDeparture.job";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../services/baroApiService", () => ({
  fetchBaroData: jest.fn(),
  isBaroActive: jest.fn((activation: string, expiry: string) => {
    const now = new Date();
    return now >= new Date(activation) && now <= new Date(expiry);
  }),
}));

jest.mock("../../services/currentService", () => ({
  upsertCurrent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/notificationService", () => ({
  sendBaroDepartureNotification: jest.fn().mockResolvedValue(undefined),
}));

import { fetchBaroData } from "../../services/baroApiService";
import { upsertCurrent } from "../../services/currentService";
import { sendBaroDepartureNotification } from "../../services/notificationService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockUpsert = upsertCurrent as jest.Mock;
const mockSendDeparture = sendBaroDepartureNotification as jest.Mock;

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

describe("baroDeparture.job", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends departure notification when Baro just left (next arrival > 7 days)", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() + 14 * 86400_000).toISOString(), // 14 days away
        expiry: new Date(Date.now() + 16 * 86400_000).toISOString(),
      })
    );

    const result = await baroDepartureJob();

    expect(result.notificationSent).toBe(true);
    expect(result.updated).toBe(true);
    expect(mockSendDeparture).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(false, expect.any(String), expect.any(String), "Strata Relay");
  });

  it("does not send when Baro is still active", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() - 3600_000).toISOString(),
        expiry: new Date(Date.now() + 3600_000).toISOString(),
      })
    );

    const result = await baroDepartureJob();

    expect(result.notificationSent).toBe(false);
    expect(result.reason).toBe("still-active");
    expect(mockSendDeparture).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(true, expect.any(String), expect.any(String), "Strata Relay");
  });

  it("does not send when next arrival is within 7 days (Baro wasn't here)", async () => {
    mockFetchBaroData.mockResolvedValue(
      baroData({
        activation: new Date(Date.now() + 5 * 86400_000).toISOString(), // 5 days away
        expiry: new Date(Date.now() + 7 * 86400_000).toISOString(),
      })
    );

    const result = await baroDepartureJob();

    expect(result.notificationSent).toBe(false);
    expect(result.reason).toBe("not-here-this-weekend");
    expect(mockSendDeparture).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalled(); // Still updates DB
  });

  it("throws when fetchBaroData fails", async () => {
    mockFetchBaroData.mockRejectedValue(new Error("API down"));
    await expect(baroDepartureJob()).rejects.toThrow("API down");
  });
});
