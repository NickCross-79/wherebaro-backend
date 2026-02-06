import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { sendTestNotification } from "../../jobs/testNotification.job";

export async function sendTestNotificationManual(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Manual test notification triggered at ${new Date().toISOString()}`);

    try {
        await sendTestNotification();
        
        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                message: "Test notification sent successfully",
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        context.error(`Test notification failed: ${error}`);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        return {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ 
                error: "Failed to send test notification", 
                details: errorMessage 
            })
        };
    }
}

app.http('sendTestNotification', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: sendTestNotificationManual
});
