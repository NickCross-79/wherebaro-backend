/**
 * Service for managing wishlist push tokens on items.
 * When a user wishlists an item, their push token is stored
 * directly on the item document for efficient lookup during
 * Baro arrival checks.
 */
import { collections, connectToDatabase } from '../db/database.service';
import { ObjectId } from 'mongodb';

/**
 * Add a push token to an item's wishlistPushTokens array.
 * Uses $addToSet to avoid duplicates.
 * @param itemId - The MongoDB ObjectId of the item
 * @param pushToken - The Expo push token to add
 */
export async function addWishlistPushToken(itemId: ObjectId, pushToken: string): Promise<boolean> {
  await connectToDatabase();

  if (!collections.items) {
    throw new Error('Items collection not initialized');
  }

  const result = await collections.items.updateOne(
    { _id: itemId },
    { $addToSet: { wishlistPushTokens: pushToken } } as any
  );

  if (result.matchedCount === 0) {
    throw new Error(`Item not found: ${itemId}`);
  }

  console.log(`[Wishlist] Added push token to item ${itemId}`);
  return true;
}

/**
 * Remove a push token from an item's wishlistPushTokens array.
 * @param itemId - The MongoDB ObjectId of the item
 * @param pushToken - The Expo push token to remove
 */
export async function removeWishlistPushToken(itemId: ObjectId, pushToken: string): Promise<boolean> {
  await connectToDatabase();

  if (!collections.items) {
    throw new Error('Items collection not initialized');
  }

  const result = await collections.items.updateOne(
    { _id: itemId },
    { $pull: { wishlistPushTokens: pushToken } } as any
  );

  if (result.matchedCount === 0) {
    throw new Error(`Item not found: ${itemId}`);
  }

  console.log(`[Wishlist] Removed push token from item ${itemId}`);
  return true;
}

/**
 * Replace an old push token with a new one across all items.
 * Used when a device's push token refreshes.
 * @param oldToken - The old Expo push token
 * @param newToken - The new Expo push token
 */
export async function replaceWishlistPushToken(oldToken: string, newToken: string): Promise<number> {
  await connectToDatabase();

  if (!collections.items) {
    throw new Error('Items collection not initialized');
  }

  // Pull the old token and add the new one in items that had it
  const itemsWithOldToken = await collections.items
    .find({ wishlistPushTokens: oldToken })
    .toArray();

  let updatedCount = 0;
  for (const item of itemsWithOldToken) {
    await collections.items.updateOne(
      { _id: item._id },
      {
        $pull: { wishlistPushTokens: oldToken },
        $addToSet: { wishlistPushTokens: newToken }
      } as any
    );
    updatedCount++;
  }

  console.log(`[Wishlist] Replaced push token across ${updatedCount} item(s)`);
  return updatedCount;
}

/**
 * Get all items in the current Baro inventory that have wishlisted push tokens.
 * Queries the `current` collection for inventory item IDs, then finds which
 * of those items have non-empty wishlistPushTokens arrays.
 * @returns Map of pushToken -> array of item names that matched
 */
export async function getWishlistMatchesForCurrentInventory(): Promise<Map<string, string[]>> {
  await connectToDatabase();

  if (!collections.items || !collections.current) {
    throw new Error('Items or Current collection not initialized');
  }

  // Get the current Baro inventory item IDs
  const currentRecord = await collections.current.findOne({});
  if (!currentRecord || !currentRecord.inventory || currentRecord.inventory.length === 0) {
    console.log('[Wishlist] No current Baro inventory found');
    return new Map();
  }

  const inventoryIds = currentRecord.inventory.map((id: any) =>
    typeof id === 'string' ? new ObjectId(id) : id
  );

  // Find items in Baro's inventory that have wishlist tokens
  const matchedItems = await collections.items
    .find({
      _id: { $in: inventoryIds },
      wishlistPushTokens: { $exists: true, $ne: [] }
    })
    .toArray();

  // Build a map: pushToken -> [itemName, itemName, ...]
  const tokenToItems = new Map<string, string[]>();

  for (const item of matchedItems) {
    const tokens: string[] = item.wishlistPushTokens || [];
    for (const token of tokens) {
      if (!tokenToItems.has(token)) {
        tokenToItems.set(token, []);
      }
      tokenToItems.get(token)!.push(item.name);
    }
  }

  console.log(`[Wishlist] Found ${matchedItems.length} wishlisted item(s) in Baro inventory, across ${tokenToItems.size} user(s)`);
  return tokenToItems;
}
