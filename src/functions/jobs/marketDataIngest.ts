import { app, InvocationContext, Timer } from "@azure/functions";
import { connectToDatabase } from "../../db/database.service.js";
import { fetchMarketData } from "../../services/marketIngestService.js";

export async function marketDataIngestScheduled(myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log(`Daily market data ingest started at ${new Date().toISOString()}`);

  try {
    //await connectToDatabase();
    //await fetchMarketData();
    context.log("Daily market data ingestion completed successfully");
  } catch (error) {
    context.error("Error in daily market data ingest function:", error);
  }
}

app.timer("marketDataIngestScheduled", {
  schedule: "0 */1 * * * *",
  handler: marketDataIngestScheduled
});