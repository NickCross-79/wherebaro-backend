/**
 * Tests that the three Baro manual endpoints triggered from the Whenbaro Admin
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

import { baroResyncInventoryManualHttp } from "../../functions/manual/baroResyncInventoryManual";
import { baroArrivalManualHttp } from "../../functions/manual/baroArrivalManual";
import { baroDepartureManualHttp } from "../../functions/manual/baroDepartureManual";
import { baroResyncInventoryJob } from "../../jobs/baroResyncInventory.job";
import { baroArrivalJob } from "../../jobs/baroArrival.job";
import { baroDepartureJob } from "../../jobs/baroDeparture.job";

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
