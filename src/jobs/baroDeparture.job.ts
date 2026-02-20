/**
 * Job: Baro Departure (Sunday)
 *
 * Runs Sunday at Baro's typical departure time.
 * Determines whether Baro was here this weekend and just left,
 * updates the DB to reflect his absence, and sends a departure notification.
 *
 * Uses the biweekly cycle to distinguish "just departed" from
 * "wasn't here this weekend": if the next activation is more than
 * 7 days away, Baro was here and just left.
 */
import { fetchBaroData, isBaroActive } from "../services/baroApiService";
import { upsertCurrent } from "../services/currentService";
import { sendBaroDepartureNotification } from "../services/notificationService";

export async function baroDepartureJob() {
    console.log("[Baro Departure] Checking if Baro just left...");

    const baroData = await fetchBaroData();
    const isHere = isBaroActive(baroData.activation, baroData.expiry);

    // Update the current document regardless (marks inactive if he left)
    await upsertCurrent(isHere, baroData.activation, baroData.expiry, baroData.location);

    if (isHere) {
        console.log("[Baro Departure] Baro is still active — has not departed yet.");
        return { updated: true, notificationSent: false, reason: "still-active" };
    }

    // If next activation is more than 7 days away, Baro was just here
    // and left (biweekly cycle). If within 7 days, he's arriving soon
    // and wasn't here this weekend.
    const daysUntilNextArrival = (new Date(baroData.activation).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysUntilNextArrival > 7) {
        console.log(`[Baro Departure] Baro just left! Next arrival in ${Math.round(daysUntilNextArrival)} days.`);
        await sendBaroDepartureNotification();
        return { updated: true, notificationSent: true };
    }

    console.log(`[Baro Departure] Baro wasn't here this weekend. Next arrival in ${Math.round(daysUntilNextArrival)} days.`);
    return { updated: true, notificationSent: false, reason: "not-here-this-weekend" };
}
