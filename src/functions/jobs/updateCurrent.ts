import { app, InvocationContext, Timer } from "@azure/functions";
import { updateCurrentJob } from "../../jobs/updateCurrent.job.js";

export async function updateCurrentTimer(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Weekly Baro update started at ${new Date().toISOString()}`);

    try {
        const result = await updateCurrentJob();
        context.log(`Weekly Baro update result: ${JSON.stringify(result)}`);
    } catch (error) {
        context.error(`Weekly Baro update failed: ${error}`);
    }
}

// 8:55 AM EST every Friday (13:55 UTC)
// CRON format: {second} {minute} {hour} {day} {month} {day-of-week}
// Friday = 5, use * for day and month to avoid conflicts
app.timer("updateBaroCurrentWeekly", {
    schedule: "0 55 13 * * Fri",
    handler: updateCurrentTimer
});