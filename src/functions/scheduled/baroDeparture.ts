/**
 * Scheduled: Baro Departure — Sunday 9:00:10 AM EDT (13:00:10 UTC)
 *
 * Checks if Baro just departed, updates the DB, and sends
 * a departure notification if he was here this weekend.
 */
import { app, InvocationContext, Timer } from "@azure/functions";
import { baroDepartureJob } from "../../jobs/baroDeparture.job";

export async function baroDeparture(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro departure check started at ${new Date().toISOString()}`);

    try {
        const result = await baroDepartureJob();
        context.log("Baro departure result:", result);
    } catch (error) {
        context.error(`Baro departure check failed: ${error}`);
    }
}

app.timer("baroDeparture", {
    schedule: "10 0 13 * * Sun",
    handler: baroDeparture,
});
