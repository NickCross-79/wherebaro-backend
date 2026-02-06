import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { checkBaroStatusAndNotify } from "../../jobs/baroNotification.job";

export async function baroNotificationCheckManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    try {
        const result = await checkBaroStatusAndNotify();

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ message: "Baro notification check completed", result })
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
