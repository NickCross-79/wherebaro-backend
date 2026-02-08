import { app, InvocationContext, Timer } from "@azure/functions";
import { checkBaroStatusAndNotify } from "../../jobs/baroNotification.job";

/**
 * Sunday morning Baro departure check — fires at 6 AM EST (11:00 UTC).
 * Baro typically leaves Sunday around 9 AM EST, so this gives users
 * a ~3-hour heads-up that he's about to leave.
 */
export async function baroDepartureNotification(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro departure notification check started at ${new Date().toISOString()}`);

    try {
        const result = await checkBaroStatusAndNotify();
        context.log(`Baro departure notification check result:`, result);
    } catch (error) {
        context.error(`Baro departure notification check failed: ${error}`);
    }
}

// Every Sunday at 6:00 AM EST = 11:00 UTC
app.timer("baroDepartureNotification", {
    schedule: "0 0 11 * * Sun",
    handler: baroDepartureNotification
});
