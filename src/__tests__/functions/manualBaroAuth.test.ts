/**
 * Tests that the Baro manual endpoints triggered from the Whenbaro Admin
 * app are unreachable without the admin API key — no key, no job run, and in
 * particular no push notification to every registered device.
 */
import { HttpRequest, InvocationContext } from "@azure/functions";

// The modules under test call app.http() at import time to register themselves.
jest.mock("@azure/functions", () => ({
  app: { http: jest.fn() },
}));

jest.mock("../../jobs/baroResyncInventory.job", () => ({
  baroResyncInventoryJob: jest.fn().mockResolvedValue({ updated: true }),
}));

jest.mock("../../jobs/baroArrival.job", () => ({
  baroArrivalJob: jest.fn().mockResolvedValue({ updated: true, notificationSent: true }),
}));

jest.mock("../../jobs/baroDeparture.job", () => ({
  baroDepartureJob: jest.fn().mockResolvedValue({ updated: true, notificationSent: true }),
}));

jest.mock("../../jobs/baroDepartingSoon.job", () => ({
  baroDepartingSoonJob: jest.fn().mockResolvedValue({ notificationSent: true }),
}));

jest.mock("../../jobs/baroReconcile.job", () => ({
  baroReconcileJob: jest.fn().mockResolvedValue({ repaired: false, notificationSent: false }),
}));

jest.mock("../../jobs/testNotification.job", () => ({
  sendTestNotification: jest.fn().mockResolvedValue(undefined),
}));

// mockBaroArrival talks to the database and notification layer directly.
jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn(),
  db: { collection: jest.fn() },
  collections: {},
}));
jest.mock("../../services/itemService", () => ({ resolveBaroInventory: jest.fn() }));
jest.mock("../../services/currentService", () => ({ upsertCurrent: jest.fn() }));
jest.mock("../../services/notificationService", () => ({
  sendBaroArrivalNotification: jest.fn(),
  sendWishlistMatchNotification: jest.fn(),
}));
jest.mock("../../services/wishlistService", () => ({ getWishlistMatchesForCurrentInventory: jest.fn() }));

import { baroResyncInventoryManualHttp } from "../../functions/manual/baroResyncInventoryManual";
import { baroArrivalManualHttp } from "../../functions/manual/baroArrivalManual";
import { baroDepartureManualHttp } from "../../functions/manual/baroDepartureManual";
import { baroResyncInventoryJob } from "../../jobs/baroResyncInventory.job";
import { baroArrivalJob } from "../../jobs/baroArrival.job";
import { baroDepartureJob } from "../../jobs/baroDeparture.job";
import { baroDepartingSoonManualHttp } from "../../functions/manual/baroDepartingSoonManual";
import { baroReconcileManualHttp } from "../../functions/manual/baroReconcileManual";
import { sendTestNotificationManualHttp } from "../../functions/manual/sendTestNotification";
import { mockBaroArrivalHttp } from "../../functions/manual/mockBaroArrival";
import { baroDepartingSoonJob } from "../../jobs/baroDepartingSoon.job";
import { baroReconcileJob } from "../../jobs/baroReconcile.job";
import { sendTestNotification } from "../../jobs/testNotification.job";
import { connectToDatabase } from "../../db/database.service";
import { sendBaroArrivalNotification } from "../../services/notificationService";

const VALID_KEY = "super-secret-admin-key";
const originalKey = process.env.ADMIN_API_KEY;

beforeEach(() => {
  process.env.ADMIN_API_KEY = VALID_KEY;
});

afterAll(() => {
  if (originalKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = originalKey;
});

function makeRequest(authHeader?: string): HttpRequest {
  return {
    headers: { get: (name: string) => (name === "Authorization" ? authHeader ?? null : null) },
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as InvocationContext;
}

const endpoints = [
  { name: "baroResyncInventory", handler: baroResyncInventoryManualHttp, job: baroResyncInventoryJob as jest.Mock },
  { name: "baroArrivalManual", handler: baroArrivalManualHttp, job: baroArrivalJob as jest.Mock },
  { name: "baroDepartureManual", handler: baroDepartureManualHttp, job: baroDepartureJob as jest.Mock },
  { name: "baroDepartingSoonManual", handler: baroDepartingSoonManualHttp, job: baroDepartingSoonJob as jest.Mock },
  { name: "baroReconcileManual", handler: baroReconcileManualHttp, job: baroReconcileJob as jest.Mock },
  { name: "sendTestNotification", handler: sendTestNotificationManualHttp, job: sendTestNotification as jest.Mock },
];

describe.each(endpoints)("$name", ({ handler, job }) => {
  it("runs the job for an authenticated request", async () => {
    const response = await handler(makeRequest(`Bearer ${VALID_KEY}`), makeContext());

    expect(response.status).toBe(200);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it("returns 401 without running the job when the header is missing", async () => {
    const response = await handler(makeRequest(), makeContext());

    expect(response.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("returns 401 without running the job when the key is wrong", async () => {
    const response = await handler(makeRequest("Bearer wrong-key"), makeContext());

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body as string).error).toBe("Unauthorized");
    expect(job).not.toHaveBeenCalled();
  });

  it("returns 401 without running the job when the server has no key configured", async () => {
    delete process.env.ADMIN_API_KEY;

    const response = await handler(makeRequest(`Bearer ${VALID_KEY}`), makeContext());

    expect(response.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("surfaces a job failure as a 500 with details", async () => {
    job.mockRejectedValueOnce(new Error("upstream exploded"));

    const response = await handler(makeRequest(`Bearer ${VALID_KEY}`), makeContext());

    expect(response.status).toBe(500);
    expect(JSON.parse(response.body as string).details).toBe("upstream exploded");
  });
});

describe("mockBaroArrival", () => {
  // Overwrites the live `current` document and pushes to every device, so an
  // unauthenticated call must not even reach the database.
  it.each([
    ["the header is missing", undefined],
    ["the key is wrong", "Bearer wrong-key"],
  ])("returns 401 without touching the database when %s", async (_label, header) => {
    const response = await mockBaroArrivalHttp(makeRequest(header), makeContext());

    expect(response.status).toBe(401);
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(sendBaroArrivalNotification).not.toHaveBeenCalled();
  });
});
