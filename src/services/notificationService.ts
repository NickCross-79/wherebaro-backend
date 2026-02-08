/**
 * Service for sending push notifications using Expo
 */
import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushErrorReceipt } from 'expo-server-sdk';
import { getActivePushTokens, deactivatePushToken } from './pushTokenService';

const expo = new Expo();

/**
 * Send push notifications to all registered devices
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data payload
 */
export async function sendPushNotifications(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: number; failed: number }> {
  try {
    // Get all active push tokens
    const pushTokens = await getActivePushTokens();
    console.log(`[Notifications] Sending "${title}" to ${pushTokens.length} device(s)`);

    if (pushTokens.length === 0) {
      console.warn('[Notifications] No active push tokens found — skipping send');
      return { success: 0, failed: 0 };
    }

    // Create messages
    const messages: ExpoPushMessage[] = [];
    for (const pushToken of pushTokens) {
      // Check that the token is valid
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`[Notifications] Invalid Expo push token: ${pushToken}`);
        await deactivatePushToken(pushToken);
        continue;
      }

      messages.push({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
        priority: 'high',
        channelId: 'baro-alerts',
      });
    }

    // Send notifications in chunks
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('[Notifications] Error sending chunk:', error);
      }
    }

    // Process tickets to handle errors
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const token = messages[i]?.to as string;

      if (ticket.status === 'error') {
        failedCount++;
        console.error(`[Notifications] Failed for ${token}: ${ticket.message} (${ticket.details?.error})`);

        // Only deactivate token if the device itself is unregistered
        // Don't deactivate for server-side config issues like missing FCM key
        if (ticket.details?.error === 'DeviceNotRegistered') {
          console.log(`[Notifications] Deactivating unregistered device: ${token}`);
          await deactivatePushToken(token);
        }
      } else {
        successCount++;
      }
    }

    console.log(`[Notifications] Result: ${successCount} sent, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };

  } catch (error) {
    console.error('[Notifications] Error:', error);
    throw error;
  }
}

/**
 * Send Baro arrival notification to all devices
 */
export async function sendBaroArrivalNotification(location: string): Promise<void> {
  await sendPushNotifications(
    'Baro Ki\'Teer has arrived!',
    `Visit him at ${location}`,
    { type: 'baro-arrival', location }
  );
}

/**
 * Send Baro departing soon notification
 */
export async function sendBaroDepartingSoonNotification(hoursRemaining: number): Promise<void> {
  await sendPushNotifications(
    'Baro is leaving soon!',
    `Only ${hoursRemaining} hours remaining to visit Baro Ki'Teer`,
    { type: 'baro-leaving-soon', hoursRemaining }
  );
}

/**
 * Send Baro departure notification
 */
export async function sendBaroDepartureNotification(): Promise<void> {
  await sendPushNotifications(
    'Baro Ki\'Teer has departed',
    'Baro has left the relay. See you next time, Tenno!',
    { type: 'baro-departure' }
  );
}

/**
 * Send a targeted wishlist notification to a specific push token.
 * Tells the user which of their wishlisted items Baro brought.
 * @param pushToken - The Expo push token to send to
 * @param itemNames - The item names that matched their wishlist
 */
export async function sendWishlistMatchNotification(
  pushToken: string,
  itemNames: string[]
): Promise<{ success: boolean }> {
  try {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`[Notifications] Invalid Expo push token: ${pushToken}`);
      await deactivatePushToken(pushToken);
      return { success: false };
    }

    const title = itemNames.length === 1
      ? 'Baro brought an item on your wishlist!'
      : `Baro brought ${itemNames.length} items on your wishlist!`;

    const body = itemNames.length === 1
      ? 'Grab it before he leaves!'
      : 'Grab them before he leaves!';

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: { type: 'wishlist-match', items: itemNames },
      priority: 'high',
      channelId: 'baro-alerts',
    };

    const [ticket] = await expo.sendPushNotificationsAsync([message]);

    if (ticket.status === 'error') {
      console.error(`[Notifications] Wishlist notification failed for ${pushToken}: ${ticket.message}`);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await deactivatePushToken(pushToken);
      }
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error(`[Notifications] Error sending wishlist notification:`, error);
    return { success: false };
  }
}
