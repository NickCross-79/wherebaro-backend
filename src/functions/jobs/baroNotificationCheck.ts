import { app, InvocationContext, Timer } from "@azure/functions";
import { checkBaroStatusAndNotify } from "../../jobs/baroNotification.job";

export async function baroNotificationCheck(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro notification check started at ${new Date().toISOString()}`);

    try {
        const result = await checkBaroStatusAndNotify();
        context.log(`Baro notification check result:`, result);
    } catch (error) {
        context.error(`Baro notification check failed: ${error}`);
    }
}

// Run every Friday at 9:05 AM EST (14:05 UTC)
app.timer("baroNotificationCheck", {
    schedule: "0 5 14 * * Fri",
    handler: baroNotificationCheck
});
