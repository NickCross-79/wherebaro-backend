import { app, InvocationContext, Timer } from "@azure/functions";
import { sendTestNotification } from "../../jobs/testNotification.job";

export async function testNotificationTimer(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Test notification timer triggered at ${new Date().toISOString()}`);

    try {
        await sendTestNotification();
        context.log('Test notification sent successfully');
    } catch (error) {
        context.error(`Test notification failed: ${error}`);
    }
}

// Run every 10 minutes starting at 12:00 PM EST (17:00 UTC)
// Cron format: seconds minutes hours day month dayOfWeek
// This runs at :00, :10, :20, :30, :40, :50 of every hour from 5 PM to 11 PM UTC (12 PM to 6 PM EST)
app.timer("testNotificationTimer", {
    schedule: "0 0,10,20,30,40,50 17-23 * * *",
    handler: testNotificationTimer
});
