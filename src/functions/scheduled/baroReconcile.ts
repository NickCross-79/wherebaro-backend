/**
 * Scheduled: Baro Reconcile — hourly at :05 across the visit window (Fri–Sun)
 *
 * Safety net for the Friday arrival job. If that job ever bails out, this
 * repairs the `current` document and sends the arrival notification it never
 * sent — turning a silently missed arrival into an hour's delay instead of a
 * dead weekend.
 */
import { app, InvocationContext, Timer } from "@azure/functions";
import { baroReconcileJob } from "../../jobs/baroReconcile.job";

export async function baroReconcile(myTimer: Timer, context: InvocationContext): Promise<void> {
    try {
        const result = await baroReconcileJob();
        // Only worth a log line when it actually did something
        if (result.repaired || result.notificationSent) {
            context.log("Baro reconcile result:", result);
        }
    } catch (error) {
        context.error(`Baro reconcile failed: ${error}`);
    }
}

app.timer("baroReconcile", {
    schedule: "0 5 * * * Fri,Sat,Sun",
    handler: baroReconcile,
});
