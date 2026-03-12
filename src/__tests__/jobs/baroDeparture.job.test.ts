/**
 * Tests for baroDeparture.job — Sunday departure check + DB update
 */
import { baroDepartureJob } from "../../jobs/baroDeparture.job";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("../../services/baroApiService", () => ({
  fetchBaroData: jest.fn(),
  fetchFromWorldState: jest.fn(),
}));

jest.mock("../../services/currentService", () => ({
  fetchCurrent: jest.fn(),
  upsertCurrent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/notificationService", () => ({
  sendBaroDepartureNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/voteService", () => ({
  clearAllVotes: jest.fn().mockResolvedValue(undefined),
}));

import { fetchBaroData } from "../../services/baroApiService";
import { fetchCurrent, upsertCurrent } from "../../services/currentService";
import { sendBaroDepartureNotification } from "../../services/notificationService";
import { clearAllVotes } from "../../services/voteService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockFetchCurrent = fetchCurrent as jest.Mock;
const mockUpsert = upsertCurrent as jest.Mock;
const mockSendDeparture = sendBaroDepartureNotification as jest.Mock;
const mockClearAllVotes = clearAllVotes as jest.Mock;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentDoc(expiryOffset: number) {
  return {
    expiry: new Date(Date.now() + expiryOffset).toISOString(),
    activation: new Date(Date.now() - 86400_000).toISOString(),
    location: "Strata Relay",
    isHere: expiryOffset > 0,
  };
}

function nextCycleData(activationOffset = 14 * 86400_000) {
  return {
    activation: new Date(Date.now() + activationOffset).toISOString(),
    expiry: new Date(Date.now() + activationOffset + 2 * 86400_000).toISOString(),
    location: "Strata Relay",
    inventory: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("baroDeparture.job", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends departure notification when expiry has passed", async () => {
    mockFetchCurrent.mockResolvedValue(currentDoc(-3600_000)); // expired 1hr ago
    mockFetchBaroData.mockResolvedValue(nextCycleData());

    const result = await baroDepartureJob();

    expect(result.notificationSent).toBe(true);
    expect(result.updated).toBe(true);
    expect(mockSendDeparture).toHaveBeenCalled();
    expect(mockClearAllVotes).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(false, expect.any(String), expect.any(String), "Strata Relay");
  });

  it("does not send when Baro is still active (expiry in future)", async () => {
    mockFetchCurrent.mockResolvedValue(currentDoc(3600_000)); // expires in 1hr

    const result = await baroDepartureJob();

    expect(result.notificationSent).toBe(false);
    expect(result.reason).toBe("not-departed-yet");
    expect(mockSendDeparture).not.toHaveBeenCalled();
    expect(mockClearAllVotes).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("throws when fetchBaroData fails after expiry has passed", async () => {
    mockFetchCurrent.mockResolvedValue(currentDoc(-3600_000)); // expired
    mockFetchBaroData.mockRejectedValue(new Error("API down"));
    await expect(baroDepartureJob()).rejects.toThrow("API down");
  });

  it("throws when fetchCurrent fails", async () => {
    mockFetchCurrent.mockRejectedValue(new Error("DB error"));
    await expect(baroDepartureJob()).rejects.toThrow("DB error");
  });
});
