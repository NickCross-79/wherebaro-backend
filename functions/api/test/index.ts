import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { scrape } from "../../jobs/scrapeItems/baroWikiScrape.js";

export async function wherebaro(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {

  context.log("WhereBaro test API called");

  const jsonData = await scrape();

  return {
    status: 200,
    jsonBody: {
      message: "WhereBaro API is alive 🚀",
      timestamp: new Date().toISOString(),
      baroData: jsonData
    }
  };
}

app.http("wherebaro", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: wherebaro
});
