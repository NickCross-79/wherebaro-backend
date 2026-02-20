/**
 * Scheduled: Baro Arrival — Friday 9:00 AM EST (14:00 UTC)
 *
 * Consolidates the entire Friday Baro flow into a single timer:
 * API health check → inventory resolution → DB update → notifications.
 */
import { app, InvocationContext, Timer } from "@azure/functions";
import { baroArrivalJob } from "../../jobs/baroArrival.job";

export async function baroArrival(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro arrival job started at ${new Date().toISOString()}`);

    try {
        const result = await baroArrivalJob();
        context.log("Baro arrival result:", result);
    } catch (error) {
        context.error(`Baro arrival job failed: ${error}`);
    }
}

app.timer("baroArrival", {
    schedule: "0 0 14 * * Fri",
    handler: baroArrival,
});
