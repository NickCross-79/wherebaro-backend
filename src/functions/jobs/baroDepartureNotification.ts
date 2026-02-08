import { app, InvocationContext, Timer } from "@azure/functions";
import { checkBaroDeparture } from "../../jobs/baroNotification.job";

/**
 * Sunday 9 AM EST (14:00 UTC) — right when Baro typically leaves.
 * Checks if he was here this weekend and just departed.
 */
export async function baroDepartureNotification(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro departure notification check started at ${new Date().toISOString()}`);

    try {
        const result = await checkBaroDeparture();
        context.log(`Baro departure notification result:`, result);
    } catch (error) {
        context.error(`Baro departure notification failed: ${error}`);
    }
}

// Every Sunday at 9:00 AM EST = 14:00 UTC
app.timer("baroDepartureNotification", {
    schedule: "10 0 14 * * Sun",
    handler: baroDepartureNotification
});
