/**
 * Tests for baroResyncInventory.job — re-resolve the manifest, notify nobody.
 */
import { baroResyncInventoryJob } from "../../jobs/baroResyncInventory.job";

jest.mock("../../services/baroApiService", () => ({
  fetchBaroData: jest.fn(),
  isBaroActive: jest.fn((activation: string, expiry: string) => {
    const now = new Date();
    return now >= new Date(activation) && now <= new Date(expiry);
  }),
}));

jest.mock("../../services/itemService", () => ({
  resolveBaroInventory: jest.fn(),
}));

jest.mock("../../services/currentService", () => ({
  fetchCurrent: jest.fn(),
  upsertCurrent: jest.fn().mockResolvedValue(undefined),
  markArrivalNotified: jest.fn().mockResolvedValue(undefined),
}));

// Spies on the notification layer. The job must never reach these — it does not
// even import them, and this proves the wiring keeps it that way.
jest.mock("../../services/notificationService", () => ({
  sendBaroArrivalNotification: jest.fn(),
  sendWishlistMatchNotification: jest.fn(),
  sendPushNotifications: jest.fn(),
}));

import { fetchBaroData } from "../../services/baroApiService";
import { resolveBaroInventory } from "../../services/itemService";
import { fetchCurrent, upsertCurrent, markArrivalNotified } from "../../services/currentService";
import {
  sendBaroArrivalNotification,
  sendWishlistMatchNotification,
  sendPushNotifications,
} from "../../services/notificationService";

const mockFetchBaroData = fetchBaroData as jest.Mock;
const mockResolve = resolveBaroInventory as jest.Mock;
const mockFetchCurrent = fetchCurrent as jest.Mock;
const mockUpsert = upsertCurrent as jest.Mock;
const mockMarkNotified = markArrivalNotified as jest.Mock;

const ACTIVATION = new Date(Date.now() - 6 * 3600_000).toISOString();
const EXPIRY = new Date(Date.now() + 41 * 3600_000).toISOString();

const OLD_ITEM = { uniqueName: "/Lotus/Foo", item: "Primed Flow", ducats: 300, credits: 175000 };
const NEW_ITEM = { uniqueName: "/Lotus/Bar", item: "Brand New Mod", ducats: 500, credits: 200000 };

function liveBaro(overrides: Record<string, any> = {}) {
  return {
    activation: ACTIVATION,
    expiry: EXPIRY,
    location: "Orcus Relay (Pluto)",
    inventory: [OLD_ITEM, NEW_ITEM],
    source: "warframestat",
    ...overrides,
  };
}

describe("baroResyncInventory.job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolve.mockResolvedValue({
      inventoryIds: [{ toHexString: () => "a" }, { toHexString: () => "b" }],
      unmatchedItems: [],
      ignoredItems: [],
    });
  });

  it("picks up an item that became resolvable and reports the delta", async () => {
    // The real case: @wfcd/items was updated, so the new mod now resolves and the
    // stored manifest goes from incomplete to complete
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue({ isActive: true, items: [{ name: "Primed Flow" }] });

    const result = await baroResyncInventoryJob();

    expect(result).toMatchObject({
      updated: true,
      notificationsSent: false,
      itemsBefore: 1,
      itemsAfter: 2,
      totalApiItems: 2,
    });
    expect(mockResolve).toHaveBeenCalledWith([OLD_ITEM, NEW_ITEM]);
    expect(mockUpsert).toHaveBeenCalledWith(true, ACTIVATION, EXPIRY, "Orcus Relay (Pluto)", expect.any(Array));
  });

  it("sends no notification of any kind", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue({ isActive: true, items: [{ name: "Primed Flow" }] });

    await baroResyncInventoryJob();

    expect(sendBaroArrivalNotification).not.toHaveBeenCalled();
    expect(sendWishlistMatchNotification).not.toHaveBeenCalled();
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("leaves the arrival-notification stamp untouched", async () => {
    // Must neither claim a notification was sent nor clear an existing stamp
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue({ isActive: true, items: [], arrivalNotifiedFor: ACTIVATION });

    await baroResyncInventoryJob();

    expect(mockMarkNotified).not.toHaveBeenCalled();
  });

  it("does nothing when Baro is not active", async () => {
    mockFetchBaroData.mockResolvedValue(
      liveBaro({
        activation: new Date(Date.now() + 5 * 86400_000).toISOString(),
        expiry: new Date(Date.now() + 7 * 86400_000).toISOString(),
        inventory: [],
      })
    );

    const result = await baroResyncInventoryJob();

    expect(result).toMatchObject({ updated: false, reason: "baro-not-active" });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("refuses to overwrite a stored manifest with an empty upstream one", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro({ inventory: [] }));

    const result = await baroResyncInventoryJob();

    expect(result).toMatchObject({ updated: false, reason: "upstream-empty-inventory" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("still reports anything that remains unresolvable", async () => {
    // Package updated but the item is still unknown — surfaced, not hidden
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue({ isActive: true, items: [{ name: "Primed Flow" }] });
    mockResolve.mockResolvedValue({
      inventoryIds: [{ toHexString: () => "a" }],
      unmatchedItems: ["Brand New Mod"],
      ignoredItems: [],
    });

    const result = await baroResyncInventoryJob();

    expect(result).toMatchObject({ updated: true, itemsAfter: 1, unmatchedItems: ["Brand New Mod"] });
  });

  it("is idempotent — a second run reports no change", async () => {
    mockFetchBaroData.mockResolvedValue(liveBaro());
    mockFetchCurrent.mockResolvedValue({ isActive: true, items: [{ name: "a" }, { name: "b" }] });

    const result = await baroResyncInventoryJob();

    expect(result).toMatchObject({ updated: true, itemsBefore: 2, itemsAfter: 2 });
  });
});
