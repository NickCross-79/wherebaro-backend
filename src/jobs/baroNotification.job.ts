/**
 * Jobs to send Baro arrival and departure notifications.
 * Purely API-driven — no database state needed.
 */
import { sendBaroArrivalNotification, sendBaroDepartingSoonNotification, sendBaroDepartureNotification, sendWishlistMatchNotification } from '../services/notificationService';
import { getWishlistMatchesForCurrentInventory } from '../services/wishlistService';
import { fetchBaroData } from '../services/baroApiService';

/**
 * Called on Friday when Baro is expected to arrive.
 * Checks if he's currently active and sends an arrival notification.
 */
export async function checkBaroArrival(): Promise<{ notificationSent: boolean }> {
  try {
    console.log('[Baro Arrival] Checking Baro status...');
    const baroData = await fetchBaroData();

    const now = new Date();
    const activation = new Date(baroData.activation);
    const expiry = new Date(baroData.expiry);
    const isActive = now >= activation && now < expiry;

    if (isActive) {
      console.log(`[Baro Arrival] Baro is here at ${baroData.location}! Sending notification...`);
      await sendBaroArrivalNotification(baroData.location);

      // Send targeted wishlist notifications
      try {
        const wishlistMatches = await getWishlistMatchesForCurrentInventory();
        let wishlistSent = 0;
        for (const [token, itemNames] of wishlistMatches) {
          const result = await sendWishlistMatchNotification(token, itemNames);
          if (result.success) wishlistSent++;
        }
        console.log(`[Baro Arrival] Sent ${wishlistSent} wishlist notification(s)`);
      } catch (wishlistError) {
        // Don't let wishlist errors block the main arrival notification
        console.error('[Baro Arrival] Error sending wishlist notifications:', wishlistError);
      }

      return { notificationSent: true };
    }

    console.log(`[Baro Arrival] Baro is not active. Next arrival: ${baroData.activation}`);
    return { notificationSent: false };

  } catch (error) {
    console.error('[Baro Arrival] Error:', error);
    throw error;
  }
}

/**
 * Called on Sunday morning before Baro leaves.
 * Checks if he's still active and sends a departing soon warning.
 */
export async function checkBaroDepartingSoon(): Promise<{ notificationSent: boolean }> {
  try {
    console.log('[Baro Departing Soon] Checking Baro status...');
    const baroData = await fetchBaroData();

    const now = new Date();
    const activation = new Date(baroData.activation);
    const expiry = new Date(baroData.expiry);
    const isActive = now >= activation && now < expiry;

    if (isActive) {
      const msUntilExpiry = expiry.getTime() - now.getTime();
      const hoursLeft = Math.round(msUntilExpiry / (60 * 60 * 1000)) || 1;
      console.log(`[Baro Departing Soon] Baro leaving in ~${hoursLeft}h — sending warning...`);
      await sendBaroDepartingSoonNotification(hoursLeft);
      return { notificationSent: true };
    }

    console.log(`[Baro Departing Soon] Baro is not active — no warning needed.`);
    return { notificationSent: false };

  } catch (error) {
    console.error('[Baro Departing Soon] Error:', error);
    throw error;
  }
}

/**
 * Called on Sunday at 9 AM EST after Baro typically leaves.
 * If Baro is no longer active and his next activation is NOT the following
 * Friday (i.e. it's ~2 weeks out), that means he was here this weekend
 * and just departed.
 */
export async function checkBaroDeparture(): Promise<{ notificationSent: boolean }> {
  try {
    console.log('[Baro Departure] Checking if Baro just left...');
    const baroData = await fetchBaroData();

    const now = new Date();
    const activation = new Date(baroData.activation);
    const expiry = new Date(baroData.expiry);
    const isActive = now >= activation && now < expiry;

    if (isActive) {
      console.log('[Baro Departure] Baro is still active — has not departed yet.');
      return { notificationSent: false };
    }

    // If next activation is more than 7 days away, Baro was just here
    // and left (biweekly cycle). If it's within 7 days, he's arriving
    // soon and wasn't here this weekend.
    const daysUntilNextArrival = (activation.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntilNextArrival > 7) {
      console.log(`[Baro Departure] Baro just left! Next arrival in ${Math.round(daysUntilNextArrival)} days. Sending notification...`);
      await sendBaroDepartureNotification();
      return { notificationSent: true };
    }

    console.log(`[Baro Departure] Baro wasn't here this weekend. Next arrival in ${Math.round(daysUntilNextArrival)} days.`);
    return { notificationSent: false };

  } catch (error) {
    console.error('[Baro Departure] Error:', error);
    throw error;
  }
}
