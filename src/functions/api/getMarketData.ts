import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getMarketDataJob } from "../../jobs/getMarketData.job.js";

export async function getMarketData(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  try {
    const bodyText = await request.text();
    const body = bodyText ? JSON.parse(bodyText) : null;
    const itemId = request.query.get("item_id") || body?.item_id;

    if (!itemId) {
      return {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Missing required parameter: item_id" })
      };
    }

    const marketData = await getMarketDataJob(itemId);

    if (!marketData) {
      return {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        },
        body: JSON.stringify({ error: "Market data not found" })
      };
    }

    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: JSON.stringify({
        message: "Market data fetched successfully",
        market: marketData
      })
    };
  } catch (error) {
    context.error(`Error fetching market data: ${error}`);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Failed to fetch market data", details: errorMessage })
    };
  }
}

app.http("getMarketData", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: getMarketData
});