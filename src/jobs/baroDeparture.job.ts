/**
 * Job: Baro Departure (Sunday)
 *
 * Runs Sunday at Baro's typical departure time.
 * Flow:
 *   1. Read the `current` document — if expiry is still in the future, Baro
 *      hasn't left yet and we bail early.
 *   2. Baro just left: poll the Baro API until it returns a new (future)
 *      expiration time, signalling the next visit cycle has been published.
 *   3. Upsert the `current` document with the new cycle's activation/expiry.
 *   4. Send the departure notification and clear all votes.
 */
import { fetchBaroData, fetchFromWorldState, BaroApiResponse } from "../services/baroApiService";
import { fetchCurrent, upsertCurrent } from "../services/currentService";
import { sendBaroDepartureNotification } from "../services/notificationService";
import { clearAllVotes } from "../services/voteService";

const POLL_MAX_ATTEMPTS = 6;
const POLL_DELAY_MS = 10_000; // 10 seconds between attempts

/**
 * Polls the Baro API until it returns a new expiry date that is in the future,
 * indicating the API has been updated with the next visit cycle.
 */
async function pollForNextBaroCycle(): Promise<BaroApiResponse> {
    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
        const data = await fetchBaroData();

        if (new Date(data.expiry) > new Date()) {
            if (attempt > 1) {
                console.log(`[Baro Departure] Received new cycle data on attempt ${attempt}.`);
            }
            return data;
        }

        if (attempt < POLL_MAX_ATTEMPTS) {
            console.warn(
                `[Baro Departure] API still returning expired expiry ` +
                `(attempt ${attempt}/${POLL_MAX_ATTEMPTS}). ` +
                `Retrying in ${POLL_DELAY_MS / 1000}s...`
            );
            await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
        }
    }

    console.warn(`[Baro Departure] API still returning old expiry after ${POLL_MAX_ATTEMPTS} attempts — falling back to world state.`);
    try {
        const worldStateData = await fetchFromWorldState();
        if (new Date(worldStateData.expiry) > new Date()) {
            console.log("[Baro Departure] World state fallback returned a valid future expiry.");
            return worldStateData;
        }
        console.warn("[Baro Departure] World state also returned an expired/stale expiry — proceeding with last poll response.");
    } catch (wsError) {
        console.error("[Baro Departure] World state fallback failed:", wsError);
    }
    return fetchBaroData();
}

export async function baroDepartureJob({ sendNotification = true }: { sendNotification?: boolean } = {}) {
    console.log("[Baro Departure] Checking if Baro just left...");

    // Check the stored expiry — if it hasn't passed, Baro is still here
    const current = await fetchCurrent();
    const expiryPassed = new Date(current.expiry) < new Date();

    if (!expiryPassed) {
        console.log("[Baro Departure] Baro's expiry has not passed yet — he has not departed.");
        return { updated: false, notificationSent: false, reason: "not-departed-yet" };
    }

    console.log("[Baro Departure] Baro has departed. Sending departure notification and clearing votes...");

    // Notify users and reset votes first — these don't require next-cycle API data
    if (sendNotification) {
        await sendBaroDepartureNotification();
    } else {
        console.log("[Baro Departure] Skipping notification (sendNotification=false).");
    }
    await clearAllVotes();

    console.log("[Baro Departure] Polling API for next cycle data...");

    // Poll the API until it publishes the next visit's activation/expiry.
    // This is best-effort: a failure here does not undo the notification already sent.
    try {
        const newBaroData = await pollForNextBaroCycle();

        // Update the DB with the new cycle info (Baro is now inactive)
        await upsertCurrent(false, newBaroData.activation, newBaroData.expiry, newBaroData.location);
        console.log(`[Baro Departure] DB updated — next arrival: ${newBaroData.activation}`);
    } catch (apiError) {
        console.error("[Baro Departure] Failed to fetch next cycle data from all APIs — DB not updated:", apiError);
        return { updated: false, notificationSent: true };
    }

    return { updated: true, notificationSent: true };
}
