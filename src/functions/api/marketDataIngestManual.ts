import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { connectToDatabase } from "../../db/database.service.js";
import { fetchMarketData } from "../../services/marketIngestService.js";

export async function marketDataIngestManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  try {
    await connectToDatabase();
    await fetchMarketData();

    return {
      status: 202,
      body: JSON.stringify({ message: "Market data ingestion started" })
    };
  } catch (error) {
    context.error("Error in market data ingest http function:", error);
    return {
      status: 500,
      body: JSON.stringify({ error: "Failed to ingest market data" })
    };
  }
}

app.http("marketDataIngestManual", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: marketDataIngestManualHttp
});
