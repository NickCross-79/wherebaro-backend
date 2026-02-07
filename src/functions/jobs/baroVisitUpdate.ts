import { app, InvocationContext, Timer } from "@azure/functions";
import { updateCurrentJob } from "../../jobs/updateCurrent.job";

export async function baroVisitUpdate(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Weekly Baro update started at ${new Date().toISOString()}`);

    try {
        const result = await updateCurrentJob();
        context.log(`Weekly Baro update result: ${JSON.stringify(result)}`);
    } catch (error) {
        context.error(`Weekly Baro update failed: ${error}`);
    }
}

// Run every Friday at 9:00:10 AM EST (14:00:10 UTC)
app.timer("baroVisitUpdate", {
    schedule: "10 0 14 * * Fri",
    handler: baroVisitUpdate
});