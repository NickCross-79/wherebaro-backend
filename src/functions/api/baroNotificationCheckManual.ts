import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { baroArrivalJob } from "../../jobs/baroArrival.job";
import { baroDepartingSoonJob } from "../../jobs/baroDepartingSoon.job";
import { baroDepartureJob } from "../../jobs/baroDeparture.job";

export async function baroNotificationCheckManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // Query param "type" controls which job to run:
        //   "arrival"       - full Friday flow: update + arrival notification
        //   "departingSoon" - checks if Baro is leaving and sends warning
        //   "departure"     - checks if Baro just left, updates DB, sends notification
        //   "all" (default) - runs all three
        const type = request.query.get("type") || "all";

        let result: Record<string, any> = {};

        if (type === "arrival" || type === "all") {
            result.arrival = await baroArrivalJob();
        }
        if (type === "departingSoon" || type === "all") {
            result.departingSoon = await baroDepartingSoonJob();
        }
        if (type === "departure" || type === "all") {
            result.departure = await baroDepartureJob();
        }

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ message: "Baro notification check completed", type, result })
        };
    } catch (error) {
        context.error("Error in Baro notification check http function:", error);
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Failed to run Baro notification check" })
        };
    }
}

app.http("baroNotificationCheckManual", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: baroNotificationCheckManualHttp
});
