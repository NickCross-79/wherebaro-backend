/**
 * Service for managing push notification tokens
 */
import { collections } from '../db/database.service';
import { PushToken, CreatePushTokenDto } from '../models/PushToken';
import { ObjectId } from 'mongodb';

/**
 * Register or update a push token
 */
export async function registerPushToken(data: CreatePushTokenDto): Promise<PushToken> {
  const now = new Date();

  // Check if token exists
  const existing = await collections.pushTokens?.findOne({ token: data.token });

  if (existing) {
    // Update existing token
    await collections.pushTokens?.updateOne(
      { token: data.token },
      { 
        $set: { 
          lastUsed: now, 
          isActive: true 
        } 
      }
    );
    
    return {
      id: existing._id.toString(),
      token: existing.token,
      deviceId: existing.deviceId,
      createdAt: existing.createdAt,
      lastUsed: now,
      isActive: true,
    };
  }

  // Insert new token
  const newToken = {
    token: data.token,
    deviceId: data.deviceId,
    createdAt: now,
    lastUsed: now,
    isActive: true,
  };

  const result = await collections.pushTokens?.insertOne(newToken);

  return {
    id: result?.insertedId.toString(),
    ...newToken,
  };
}

/**
 * Get all active push tokens
 */
export async function getActivePushTokens(): Promise<string[]> {
  const tokens = await collections.pushTokens?.find({ isActive: true }).toArray();
  return tokens?.map(t => t.token) || [];
}

/**
 * Deactivate a push token (mark as invalid/expired)
 */
export async function deactivatePushToken(token: string): Promise<void> {
  await collections.pushTokens?.updateOne(
    { token },
    { $set: { isActive: false } }
  );
}

/**
 * Remove a push token
 */
export async function removePushToken(token: string): Promise<void> {
  await collections.pushTokens?.deleteOne({ token });
}

/**
 * Clean up old inactive tokens (older than 90 days)
 */
export async function cleanupInactiveTokens(): Promise<number> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await collections.pushTokens?.deleteMany({
    isActive: false,
    lastUsed: { $lt: ninetyDaysAgo }
  });

  return result?.deletedCount || 0;
}
