/**
 * Job to send test notifications (for testing only)
 */
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { getActiveTestPushTokens, deactivatePushToken } from '../services/pushTokenService';

const expo = new Expo();

export async function sendTestNotification() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });

  const tokens = await getActiveTestPushTokens();
  console.log(`[Test Notification] Sending to ${tokens.length} test device(s)`);

  if (tokens.length === 0) {
    console.warn('[Test Notification] No active test push tokens found — skipping send');
    return;
  }

  const messages: ExpoPushMessage[] = [];
  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.error(`[Test Notification] Invalid token: ${token}`);
      await deactivatePushToken(token);
      continue;
    }
    messages.push({
      to: token,
      sound: 'default',
      title: 'Baro Kiteer',
      body: `Baro Kiteer will arrive this Friday!`,
      data: { type: 'test', timestamp: now.toISOString() },
      priority: 'high',
      channelId: 'baro-alerts',
    });
  }

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error('[Test Notification] Error sending chunk:', error);
    }
  }
}
