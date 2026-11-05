/**
 * The seed endpoint inserts every scraped item without checking for existing
 * ones, so an unauthenticated call would duplicate the whole item list.
 */
import { HttpRequest, InvocationContext } from "@azure/functions";

jest.mock("@azure/functions", () => ({
  app: { http: jest.fn() },
}));

jest.mock("../../jobs/seedDB.job", () => ({
  seedDB: jest.fn().mockResolvedValue({ updated: 0 }),
}));

import { app } from "@azure/functions";
import { seedDBManualHttp } from "../../functions/manual/seedDBFunction";
import { seedDB } from "../../jobs/seedDB.job";

const VALID_KEY = "super-secret-admin-key";
const originalKey = process.env.ADMIN_API_KEY;
const registration = (app.http as jest.Mock).mock.calls.find(([name]) => name === "seedDBFunction")?.[1];

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

describe("seedDBFunction", () => {
  it("seeds for an authenticated request", async () => {
    const response = await seedDBManualHttp(makeRequest(`Bearer ${VALID_KEY}`), makeContext());

    expect(response.status).toBe(201);
    expect(seedDB).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the header is missing", undefined],
    ["the key is wrong", "Bearer wrong-key"],
  ])("returns 401 without seeding when %s", async (_label, header) => {
    const response = await seedDBManualHttp(makeRequest(header), makeContext());

    expect(response.status).toBe(401);
    expect(seedDB).not.toHaveBeenCalled();
  });

  it("refuses everything when the server has no key configured", async () => {
    delete process.env.ADMIN_API_KEY;

    const response = await seedDBManualHttp(makeRequest(`Bearer ${VALID_KEY}`), makeContext());

    expect(response.status).toBe(401);
    expect(seedDB).not.toHaveBeenCalled();
  });

  it("only accepts POST, so a crawler following a link can't trigger it", () => {
    expect(registration?.methods).toEqual(["POST"]);
  });
});
