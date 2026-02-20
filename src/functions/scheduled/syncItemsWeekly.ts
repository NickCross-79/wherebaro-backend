/**
 * Scheduled: Weekly Item Sync — Wednesday 12:00 PM EST (17:00 UTC)
 *
 * Scrapes the Warframe wiki and syncs item data into the database.
 */
import { app, InvocationContext, Timer } from "@azure/functions";
import { syncItemsJob } from "../../jobs/syncItems.job";

export async function syncItemsWeekly(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(`Weekly sync items job started at ${new Date().toISOString()}`);

    try {
        const result = await syncItemsJob();
        context.log(`Weekly sync items result: ${JSON.stringify(result)}`);
    } catch (error) {
        context.error(`Weekly sync items failed: ${error}`);
    }
}

app.timer("syncItemsWeekly", {
    schedule: "0 0 17 * * Wed",
    handler: syncItemsWeekly,
});
