/**
 * Manual trigger: Send a test push notification to all registered devices.
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { sendTestNotification } from "../../jobs/testNotification.job";

export async function sendTestNotificationManualHttp(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[Manual] Test notification triggered at ${new Date().toISOString()}`);

    try {
        await sendTestNotification();
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Test notification sent successfully", timestamp: new Date().toISOString() }),
        };
    } catch (error) {
        context.error("[Manual] Test notification failed:", error);
        const details = error instanceof Error ? error.message : "Unknown error";
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Failed to send test notification", details }),
        };
    }
}

app.http("sendTestNotification", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: sendTestNotificationManualHttp,
});
