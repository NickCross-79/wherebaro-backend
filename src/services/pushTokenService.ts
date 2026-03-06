/**
 * Service for managing push notification tokens
 */
import { collections, connectToDatabase } from '../db/database.service';
import { PushToken, CreatePushTokenDto } from '../models/PushToken';

/**
 * Truncate sensitive data for logging
 */
function truncate(value: string | undefined, maxLength: number = 12): string {
  if (!value) return 'unknown';
  if (value.length <= maxLength) return value;
  return `${value.substring(0, maxLength)}...`;
}

/**
 * Register or update a push token
 */
export async function registerPushToken(data: CreatePushTokenDto): Promise<PushToken> {
  await connectToDatabase();
  const now = new Date();

  const existing = await collections.pushTokens?.findOne({ token: data.token });

  if (existing) {
    await collections.pushTokens?.updateOne(
      { token: data.token },
      { $set: { lastUsed: now, isActive: true } }
    );
    console.log(`[Push Tokens] Updated existing token for device ${truncate(data.deviceId)}`);
    
    return {
      id: existing._id.toString(),
      token: existing.token,
      deviceId: existing.deviceId,
      createdAt: existing.createdAt,
      lastUsed: now,
      isActive: true,
    };
  }

  const newToken = {
    token: data.token,
    deviceId: data.deviceId,
    createdAt: now,
    lastUsed: now,
    isActive: true,
  };

  const result = await collections.pushTokens?.insertOne(newToken);
  console.log(`[Push Tokens] Registered new token for device ${truncate(data.deviceId)}`);

  return {
    id: result?.insertedId.toString(),
    ...newToken,
  };
}

/**
 * Get all active push tokens
 */
export async function getActivePushTokens(): Promise<string[]> {
  await connectToDatabase();
  const tokens = await collections.pushTokens?.find({ isActive: true }).toArray();
  return tokens?.map(t => t.token) || [];
}

/**
 * Deactivate a push token (mark as invalid/expired)
 */
export async function deactivatePushToken(token: string): Promise<void> {
  await connectToDatabase();
  await collections.pushTokens?.updateOne(
    { token },
    { $set: { isActive: false } }
  );
  console.log(`[Push Tokens] Deactivated token: ${token.substring(0, 20)}...`);
}

/**
 * Remove a push token
 */
export async function removePushToken(token: string): Promise<void> {
  await connectToDatabase();
  await collections.pushTokens?.deleteOne({ token });
  console.log(`[Push Tokens] Removed token: ${token.substring(0, 20)}...`);
}

/**
 * Clean up old inactive tokens (older than 90 days)
 */
export async function cleanupInactiveTokens(): Promise<number> {
  await connectToDatabase();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await collections.pushTokens?.deleteMany({
    isActive: false,
    lastUsed: { $lt: ninetyDaysAgo }
  });

  return result?.deletedCount || 0;
}
