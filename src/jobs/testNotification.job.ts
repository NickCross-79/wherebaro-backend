/**
 * Job to send test notifications (for testing only)
 */
import { sendPushNotifications } from '../services/notificationService';

export async function sendTestNotification() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });

  await sendPushNotifications(
    'Test Notification 🔔',
    `This is a test notification sent at ${timeString}`,
    { type: 'test', timestamp: now.toISOString() }
  );
}
