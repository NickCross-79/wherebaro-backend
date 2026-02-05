/**
 * Job to remove a push notification token
 */
import { removePushToken } from '../services/pushTokenService';

export async function removePushTokenJob(token: string) {
  return await removePushToken(token);
}
