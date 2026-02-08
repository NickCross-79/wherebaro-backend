import { app, InvocationContext, Timer } from "@azure/functions";
import { checkBaroDeparture } from "../../jobs/baroNotification.job";
import { updateCurrentJob } from "../../jobs/updateCurrent.job";

/**
 * Sunday 9 AM EST (14:00 UTC) — right when Baro typically leaves.
 * Checks if he was here this weekend and just departed,
 * then updates the current Baro data in the DB.
 */
export async function baroDepartureCheck(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro departure check started at ${new Date().toISOString()}`);

    try {
        const result = await checkBaroDeparture();
        context.log(`Baro departure check result:`, result);
    } catch (error) {
        context.error(`Baro departure check failed: ${error}`);
    }

    try {
        const updateResult = await updateCurrentJob();
        context.log(`Update current result:`, updateResult);
    } catch (error) {
        context.error(`Update current failed: ${error}`);
    }
}

// Every Sunday at 9:00 AM EST = 14:00 UTC
app.timer("baroDepartureCheck", {
    schedule: "10 0 14 * * Sun",
    handler: baroDepartureCheck
});
