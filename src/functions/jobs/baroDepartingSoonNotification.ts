import { app, InvocationContext, Timer } from "@azure/functions";
import { checkBaroDepartingSoon } from "../../jobs/baroNotification.job";

/**
 * Sunday morning Baro departing soon check — fires at 6 AM EST (11:00 UTC).
 * Baro typically leaves Sunday around 9 AM EST, so this gives users
 * a ~3-hour heads-up that he's about to leave.
 */
export async function baroDepartingSoonNotification(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Baro departing soon notification check started at ${new Date().toISOString()}`);

    try {
        const result = await checkBaroDepartingSoon();
        context.log(`Baro departing soon notification result:`, result);
    } catch (error) {
        context.error(`Baro departing soon notification failed: ${error}`);
    }
}

// Every Sunday at 6:00 AM EST = 11:00 UTC
app.timer("baroDepartingSoonNotification", {
    schedule: "0 0 11 * * Sun",
    handler: baroDepartingSoonNotification
});
