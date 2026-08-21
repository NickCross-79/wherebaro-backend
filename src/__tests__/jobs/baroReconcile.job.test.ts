/**
 * Tests for baroReconcile.job — the safety net that repairs a missed arrival.
 */
import { baroReconcileJob } from "../../jobs/baroReconcile.job";

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
  }),
}));

jest.mock("../../services/currentService", () => ({
  fetchCurrent: jest.fn(),
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
import { fetchCurrent, upsertCurrent, markArrivalNotified } from "../../services/currentService";
import { sendBaroArrivalNotification } from "../../services/notificationService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockResolve = resolveBaroInventory as jest.Mock;
const mockFetchCurrent = fetchCurrent as jest.Mock;
const mockUpsert = upsertCurrent as jest.Mock;
const mockMarkNotified = markArrivalNotified as jest.Mock;
const mockSendArrival = sendBaroArrivalNotification as jest.Mock;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTIVATION = new Date(Date.now() - 2 * 3600_000).toISOString();
const EXPIRY = new Date(Date.now() + 45 * 3600_000).toISOString();

const ITEM = { uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 };

function liveBaro(overrides: Record<string, any> = {}) {
  return {
    activation: ACTIVATION,
    expiry: EXPIRY,
    location: "Orcus Relay (Pluto)",
    inventory: [ITEM],
    source: "warframestat",
    ...overrides,
  };
}

/** The exact broken document the failed arrival job left behind. */
function brokenCurrent(overrides: Record<string, any> = {}) {
  return {
    isActive: false,
    activation: ACTIVATION,
    expiry: EXPIRY,
    location: "Orcus Relay (Pluto)",
    items: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("baroReconcile.job", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does nothing when Baro is not active", async () => {
    mockFetchBaroData.mockResolvedValue(
      liveBaro({
        activation: new Date(Date.now() + 5 * 86400_000).toISOString(),
        expiry: new Date(Date.now() + 7 * 86400_000).toISOString(),
        inventory: [],
      })
    );

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: false, reason: "baro-not-active" });
    expect(mockFetchCurrent).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockSendArrival).not.toHaveBeenCalled();
  });

  it("leaves a healthy document untouched", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(
      brokenCurrent({ isActive: true, items: [{ name: "Primed Flow" }] })
    );

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: false, reason: "already-consistent" });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockSendArrival).not.toHaveBeenCalled();
  });

  it("repairs the document AND sends the missed notification", async () => {
    // The outage state: arrival job stored isActive:false with no inventory
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(brokenCurrent());

    const result = await baroReconcileJob();

    expect(result).toMatchObject({
      repaired: true,
      notificationSent: true,
      reason: "stored-inactive-while-baro-here",
      inventoryCount: 1,
    });
    expect(mockResolve).toHaveBeenCalledWith([ITEM]);
    expect(mockUpsert).toHaveBeenCalledWith(true, ACTIVATION, EXPIRY, "Orcus Relay (Pluto)", expect.any(Array));
    expect(mockSendArrival).toHaveBeenCalledWith("Orcus Relay (Pluto)");
    expect(mockMarkNotified).toHaveBeenCalledWith(ACTIVATION);
  });

  it("repairs an active document that has no inventory", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(brokenCurrent({ isActive: true, items: [] }));

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: true, reason: "stored-empty-inventory" });
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("repairs when the stored document is from a previous cycle", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(
      brokenCurrent({
        isActive: true,
        items: [{ name: "Old Item" }],
        activation: new Date(Date.now() - 14 * 86400_000).toISOString(),
      })
    );

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: true, reason: "stale-cycle-stored" });
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("repairs WITHOUT re-notifying when this cycle was already announced", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(brokenCurrent({ arrivalNotifiedFor: ACTIVATION }));

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: true, notificationSent: false });
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockSendArrival).not.toHaveBeenCalled();
  });

  it("still notifies when the stamp is from a different cycle", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(
      brokenCurrent({ arrivalNotifiedFor: new Date(Date.now() - 14 * 86400_000).toISOString() })
    );

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ notificationSent: true });
    expect(mockSendArrival).toHaveBeenCalled();
  });

  it("treats a differently-formatted activation as the same cycle", async () => {
    // World state rebuilds timestamps through toISOString() (always .000Z) while
    // the primary API serializes its own way. Reading that as a different cycle
    // would repair and re-announce an arrival that already went out.
    mockFetchBaroData.mockResolvedValue(liveBaro({ activation: "2026-08-21T13:00:00.000Z" }));
    mockFetchCurrent.mockResolvedValue(
      brokenCurrent({
        isActive: true,
        items: [{ name: "Primed Flow" }],
        activation: "2026-08-21T13:00:00Z",
      })
    );

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: false, reason: "already-consistent" });
    expect(mockSendArrival).not.toHaveBeenCalled();
  });

  it("repairs without notifying when the document is already active for this cycle", async () => {
    // The state left by a manual arrival run that predates the notified stamp:
    // Baro is announced and active, but the inventory needs repair. Repairing is
    // right; announcing his arrival a second time is not.
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(
      brokenCurrent({ isActive: true, items: [], arrivalNotifiedFor: undefined })
    );

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: true, notificationSent: false });
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockSendArrival).not.toHaveBeenCalled();
  });

  it("still notifies when the document was never marked active", async () => {
    // The outage state proper — nothing ever announced this arrival
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue(brokenCurrent({ isActive: false, arrivalNotifiedFor: undefined }));

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: true, notificationSent: true });
    expect(mockSendArrival).toHaveBeenCalledTimes(1);
  });

  it("does not stamp an empty inventory over the document", async () => {
    // Upstream says active but has published no manifest — writing that would
    // destroy nothing useful and make the next run think it is consistent
    mockFetchBaroData.mockResolvedValue(liveBaro({ inventory: [] }));
    mockFetchCurrent.mockResolvedValue(brokenCurrent());

    const result = await baroReconcileJob();

    expect(result).toMatchObject({ repaired: false, reason: "upstream-empty-inventory" });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockSendArrival).not.toHaveBeenCalled();
  });

  it("is idempotent — a second run after a repair does nothing", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValueOnce(brokenCurrent());

    const first = await baroReconcileJob();
    expect(first).toMatchObject({ repaired: true, notificationSent: true });

    // Second run sees the repaired document
    mockFetchCurrent.mockResolvedValueOnce(
      brokenCurrent({ isActive: true, items: [{ name: "Primed Flow" }], arrivalNotifiedFor: ACTIVATION })
    );
    const second = await baroReconcileJob();

    expect(second).toMatchObject({ repaired: false, reason: "already-consistent" });
    expect(mockSendArrival).toHaveBeenCalledTimes(1);
  });
});
