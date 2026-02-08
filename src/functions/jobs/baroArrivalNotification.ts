import { app, InvocationContext, Timer } from "@azure/functions";
import { checkBaroArrival } from "../../jobs/baroNotification.job";

export async function baroArrivalNotification(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro arrival notification check started at ${new Date().toISOString()}`);

    try {
        const result = await checkBaroArrival();
        context.log(`Baro arrival notification result:`, result);
    } catch (error) {
        context.error(`Baro arrival notification failed: ${error}`);
    }
}

// Run every Friday at 9:00 AM EST (14:00 UTC)
app.timer("baroArrivalNotification", {
    schedule: "0 0 14 * * Fri",
    handler: baroArrivalNotification
});
