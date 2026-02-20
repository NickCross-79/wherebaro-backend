/**
 * Job: Baro Departing Soon (Sunday morning)
 *
 * Runs Sunday morning before Baro's typical departure.
 * Checks if Baro is still active and sends a warning notification
 * so users have time to visit him before he leaves.
 */
import { fetchBaroData, isBaroActive } from "../services/baroApiService";
import { sendBaroDepartingSoonNotification } from "../services/notificationService";

export async function baroDepartingSoonJob() {
    console.log("[Baro Departing Soon] Checking Baro status...");

    const baroData = await fetchBaroData();
    const isHere = isBaroActive(baroData.activation, baroData.expiry);

    if (!isHere) {
        console.log("[Baro Departing Soon] Baro is not active — no warning needed.");
        return { notificationSent: false };
    }

    const msUntilExpiry = new Date(baroData.expiry).getTime() - Date.now();
    const hoursLeft = Math.round(msUntilExpiry / (60 * 60 * 1000)) || 1;

    console.log(`[Baro Departing Soon] Baro leaving in ~${hoursLeft}h — sending warning...`);
    await sendBaroDepartingSoonNotification(hoursLeft);

    return { notificationSent: true, hoursLeft };
}
