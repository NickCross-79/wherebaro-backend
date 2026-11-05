/**
 * getReviews, getLikes and getVotes must never return anyone's uid: a uid is
 * the only proof of authorship for edit/delete/unlike/remove-vote. They return
 * an `isOwn` flag computed against the asking device's uid instead.
 */
import { HttpRequest, InvocationContext } from "@azure/functions";

jest.mock("@azure/functions", () => ({
  app: { http: jest.fn() },
}));

const ME = "uid-me";
const OTHER = "uid-other";

jest.mock("../../jobs/getReviews.job", () => ({
  getReviewsJob: jest.fn().mockResolvedValue([
    { _id: "r1", user: "me", content: "mine", uid: "uid-me" },
    { _id: "r2", user: "them", content: "theirs", uid: "uid-other" },
  ]),
}));

jest.mock("../../jobs/getLikes.job", () => ({
  getLikesJob: jest.fn().mockResolvedValue([
    { _id: "l1", item_oid: "i", uid: "uid-me" },
    { _id: "l2", item_oid: "i", uid: "uid-other" },
  ]),
}));

jest.mock("../../jobs/vote.job", () => ({
  getVotesJob: jest.fn().mockResolvedValue({
    buyCount: 1,
    skipCount: 1,
    votes: [
      { _id: "v1", item_oid: "i", uid: "uid-me", voteType: "buy" },
      { _id: "v2", item_oid: "i", uid: "uid-other", voteType: "skip" },
    ],
  }),
}));

import { getReviews } from "../../functions/api/getReviews";
import { getLikes } from "../../functions/api/getLikes";
import { getVotes } from "../../functions/api/getVotes";

function postRequest(body: Record<string, unknown>): HttpRequest {
  return {
    method: "POST",
    url: "https://example.test/api",
    query: new URLSearchParams(),
    text: async () => JSON.stringify(body),
  } as unknown as HttpRequest;
}

function getRequest(itemId: string): HttpRequest {
  return {
    method: "GET",
    url: `https://example.test/api?item_id=${itemId}`,
    query: new URLSearchParams({ item_id: itemId }),
    text: async () => "",
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as InvocationContext;
}

const endpoints = [
  { name: "getReviews", handler: getReviews, list: (b: any) => b.reviews },
  { name: "getLikes", handler: getLikes, list: (b: any) => b.likes },
  { name: "getVotes", handler: getVotes, list: (b: any) => b.votes },
];

describe.each(endpoints)("$name", ({ handler, list }) => {
  it("never includes a uid in the response", async () => {
    const response = await handler(postRequest({ item_id: "i", uid: ME }), makeContext());

    expect(response.status).toBe(200);
    expect(response.body as string).not.toContain(ME);
    expect(response.body as string).not.toContain(OTHER);
    for (const entry of list(JSON.parse(response.body as string))) {
      expect(entry).not.toHaveProperty("uid");
    }
  });

  it("marks only the asking device's entry as its own", async () => {
    const response = await handler(postRequest({ item_id: "i", uid: ME }), makeContext());

    const entries = list(JSON.parse(response.body as string));
    expect(entries.map((e: any) => e.isOwn)).toEqual([true, false]);
  });

  it("marks nothing as own for an anonymous GET", async () => {
    const response = await handler(getRequest("i"), makeContext());

    expect(response.status).toBe(200);
    const entries = list(JSON.parse(response.body as string));
    expect(entries.every((e: any) => e.isOwn === false)).toBe(true);
    expect(response.body as string).not.toContain(OTHER);
  });
});

describe("withOwnership", () => {
  const { withOwnership, viewerUidFrom } = jest.requireActual("../../utils/ownership");

  it("treats an empty or non-string viewer uid as anonymous", () => {
    const docs = [{ uid: "" }, { uid: "x" }];

    expect(withOwnership(docs, "").map((d: any) => d.isOwn)).toEqual([false, false]);
    expect(viewerUidFrom({ uid: 123 })).toBeUndefined();
    expect(viewerUidFrom(null)).toBeUndefined();
    expect(viewerUidFrom({ uid: "x" })).toBe("x");
  });

  it("does not mark a document with no uid as own", () => {
    expect(withOwnership([{}], "x")[0].isOwn).toBe(false);
  });
});
