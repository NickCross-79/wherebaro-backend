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

    if (pushTokens.length === 0) {
      console.log('No push tokens to send notifications to');
      return { success: 0, failed: 0 };
    }

    // Create messages
    const messages: ExpoPushMessage[] = [];
    for (const pushToken of pushTokens) {
      // Check that the token is valid
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
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
        console.error('Error sending push notification chunk:', error);
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
        console.error(`Error sending to ${token}:`, ticket.message);

        // Deactivate token if it's invalid
        if (
          ticket.details?.error === 'DeviceNotRegistered' ||
          ticket.details?.error === 'InvalidCredentials'
        ) {
          console.log(`Deactivating invalid token: ${token}`);
          await deactivatePushToken(token);
        }
      } else {
        successCount++;
      }
    }

    console.log(`Push notifications sent: ${successCount} successful, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };

  } catch (error) {
    console.error('Error in sendPushNotifications:', error);
    throw error;
  }
}

/**
 * Send Baro arrival notification to all devices
 */
export async function sendBaroArrivalNotification(location: string): Promise<void> {
  await sendPushNotifications(
    'Baro Ki\'Teer has arrived! 🎭',
    `Visit him at ${location}`,
    { type: 'baro-arrival', location }
  );
}

/**
 * Send Baro leaving soon notification
 */
export async function sendBaroLeavingSoonNotification(hoursRemaining: number): Promise<void> {
  await sendPushNotifications(
    'Baro is leaving soon! ⏰',
    `Only ${hoursRemaining} hours remaining to visit Baro Ki'Teer`,
    { type: 'baro-leaving-soon', hoursRemaining }
  );
}
