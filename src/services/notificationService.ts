/**
 * Service for sending push notifications using Expo
 */
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { getActivePushTokens, getActiveTestPushTokens, deactivatePushToken } from './pushTokenService';
import { pruneWishlistPushToken } from './wishlistService';

const expo = new Expo();

/**
 * Truncate sensitive data for logging
 */
function truncate(value: string, maxLength: number = 20): string {
  if (!value || value.length <= maxLength) return value;
  return `${value.substring(0, maxLength)}...`;
}

/**
 * Stop sending to a device Expo says is gone: deactivate its Baro-alert
 * registration and drop it from every item wishlist it is attached to.
 */
async function retireDeadToken(token: string): Promise<void> {
  await deactivatePushToken(token);
  try {
    await pruneWishlistPushToken(token);
  } catch (error) {
    console.error(`[Notifications] Failed to prune wishlist token ${truncate(token)}:`, error);
  }
}

/**
 * Send push notifications to all registered devices
 * @param title - Notification title
 * @param body - Notification body
 * @param data - Optional data payload
 */
export async function sendPushNotifications(
  title: string,
  body: string,
  data?: Record<string, any>,
  type?: 'arrival' | 'departure'
): Promise<{ success: number; failed: number }> {
  const pushTokens = await getActivePushTokens(type);
  return sendToTokens(pushTokens, title, body, data);
}

/**
 * Send push notifications to all registered TEST devices only
 * (devices in the testPushTokens collection).
 */
export async function sendTestPushNotifications(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: number; failed: number }> {
  const pushTokens = await getActiveTestPushTokens();
  return sendToTokens(pushTokens, title, body, data);
}

async function sendToTokens(
  pushTokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: number; failed: number }> {
  try {
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
        console.error(`[Notifications] Invalid Expo push token: ${truncate(pushToken)}`);
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

    const { successCount, failedCount } = await sendMessages(messages);

    console.log(`[Notifications] Result: ${successCount} sent, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };

  } catch (error) {
    console.error('[Notifications] Error:', error);
    throw error;
  }
}

/**
 * Sends prepared messages in Expo-sized chunks and handles per-ticket errors.
 *
 * Tickets come back in the same order as the messages of *their own chunk*, so
 * each chunk's tickets are matched against that chunk only. Matching against
 * the flat message list breaks as soon as one chunk throws: every later ticket
 * would be attributed to the wrong token, and a DeviceNotRegistered error would
 * deactivate some other user's device.
 */
async function sendMessages(
  messages: ExpoPushMessage[]
): Promise<{ successCount: number; failedCount: number }> {
  let successCount = 0;
  let failedCount = 0;

  for (const chunk of expo.chunkPushNotifications(messages)) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error('[Notifications] Error sending chunk:', error);
      failedCount += chunk.length;
      continue;
    }

    for (let i = 0; i < chunk.length; i++) {
      const ticket = tickets[i];
      const token = chunk[i].to as string;

      if (!ticket || ticket.status === 'error') {
        failedCount++;
        console.error(`[Notifications] Failed for ${truncate(token)}: ${ticket?.message ?? 'no ticket returned'} (${ticket?.details?.error})`);

        // Only deactivate token if the device itself is unregistered
        // Don't deactivate for server-side config issues like missing FCM key
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          console.log(`[Notifications] Deactivating unregistered device: ${truncate(token)}`);
          await retireDeadToken(token);
        }
      } else {
        successCount++;
      }
    }
  }

  return { successCount, failedCount };
}

/**
 * Send Baro arrival notification to all devices
 */
export async function sendBaroArrivalNotification(location: string): Promise<void> {
  await sendPushNotifications(
    'Baro Ki\'teer has arrived!',
    `Visit him at ${location}`,
    { type: 'baro-arrival', location },
    'arrival'
  );
}

/**
 * Send Baro departing soon notification
 */
export async function sendBaroDepartingSoonNotification(hoursRemaining: number): Promise<void> {
  const hoursText = hoursRemaining === 1 ? '1 hour' : `${hoursRemaining} hours`;
  // A "leaving soon" warning is a departure alert: users who turned departure
  // alerts off should not get it.
  await sendPushNotifications(
    'Baro is leaving soon!',
    `Only ${hoursText} remaining to visit Baro Ki'teer`,
    { type: 'baro-leaving-soon', hoursRemaining },
    'departure'
  );
}

/**
 * Send Baro departure notification
 */
export async function sendBaroDepartureNotification(): Promise<void> {
  await sendPushNotifications(
    'Baro Ki\'teer has departed',
    'Baro has left the relay. See you next time, Tenno!',
    { type: 'baro-departure' },
    'departure'
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
      console.error(`[Notifications] Invalid Expo push token: ${truncate(pushToken)}`);
      await retireDeadToken(pushToken);
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
      console.error(`[Notifications] Wishlist notification failed for ${truncate(pushToken)}: ${ticket.message}`);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await retireDeadToken(pushToken);
      }
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error(`[Notifications] Error sending wishlist notification:`, error);
    return { success: false };
  }
}
