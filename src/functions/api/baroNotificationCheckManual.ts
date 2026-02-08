import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { checkBaroArrival, checkBaroDepartingSoon, checkBaroDeparture } from "../../jobs/baroNotification.job";

export async function baroNotificationCheckManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        // Query param "type" controls which notification check to run:
        //   "arrival"       - checks if Baro has arrived and sends arrival notification
        //   "departingSoon" - checks if Baro is leaving within 3 hours and sends warning
        //   "departure"     - checks if Baro just left and sends departure notification
        //   "all" (default) - runs all three checks
        const type = request.query.get("type") || "all";

        let result: Record<string, any> = {};

        if (type === "arrival" || type === "all") {
            result.arrival = await checkBaroArrival();
        }
        if (type === "departingSoon" || type === "all") {
            result.departingSoon = await checkBaroDepartingSoon();
        }
        if (type === "departure" || type === "all") {
            result.departure = await checkBaroDeparture();
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
