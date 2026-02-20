import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { baroArrivalJob } from "../../jobs/baroArrival.job";

export async function baroVisitUpdateManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  try {
    const result = await baroArrivalJob();

    return {
      status: 202,
      body: JSON.stringify({ message: "Baro visit update started", result })
    };
  } catch (error) {
    context.error("Error in Baro visit update http function:", error);
    return {
      status: 500,
      body: JSON.stringify({ error: "Failed to update Baro visit" })
    };
  }
}

app.http("baroVisitUpdateManual", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: baroVisitUpdateManualHttp
});
