/**
 * Scheduled: Baro Arrival — Friday 13:02 UTC (just after Baro's 13:00 activation)
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

// Every Friday at 13:02 UTC. Baro activates exactly at 13:00 UTC, and firing on
// that same instant left no margin at all: the timer can fire fractionally early
// (making Baro read as not-yet-active) and every upstream source is still
// serving the previous cycle. The two-minute offset costs nothing and starts the
// job from a state the APIs can actually describe.
app.timer("baroArrival", {
    schedule: "0 2 13 * * Fri",
    handler: baroArrival,
});
