/**
 * Job to send test notifications (for testing only)
 */
import { sendTestPushNotifications } from '../services/notificationService';

export async function sendTestNotification() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  await sendTestPushNotifications(
    'Test Notification',
    `This is a test notification sent at ${timeString}`,
    { type: 'test' },
  );
}
