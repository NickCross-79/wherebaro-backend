/**
 * Scheduled: Baro Departing Soon — Sunday 6:00 AM EST (11:00 UTC)
 *
 * Sends a heads-up notification ~3 hours before Baro typically leaves.
 */
import { app, InvocationContext, Timer } from "@azure/functions";
import { baroDepartingSoonJob } from "../../jobs/baroDepartingSoon.job";

export async function baroDepartingSoon(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro departing soon check started at ${new Date().toISOString()}`);

    try {
        const result = await baroDepartingSoonJob();
        context.log("Baro departing soon result:", result);
    } catch (error) {
        context.error(`Baro departing soon check failed: ${error}`);
    }
}

app.timer("baroDepartingSoon", {
    schedule: "0 0 11 * * Sun",
    handler: baroDepartingSoon,
});
