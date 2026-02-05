/**
 * Job to register a push notification token
 */
import { registerPushToken } from '../services/pushTokenService';
import { CreatePushTokenDto } from '../models/PushToken';

export async function registerPushTokenJob(data: CreatePushTokenDto) {
  return await registerPushToken(data);
}
