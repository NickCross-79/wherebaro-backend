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
export async function addWishlistPushToken(itemId: ObjectId, pushToken?: string): Promise<boolean> {
  await connectToDatabase();

  if (!collections.items) {
    throw new Error('Items collection not initialized');
  }

  // Ensure wishlistPushTokens is an array (may be null on older documents)
  if (pushToken) {
    await collections.items.updateOne(
      { _id: itemId, wishlistPushTokens: null },
      { $set: { wishlistPushTokens: [] } }
    );
  }

  const updateOps: any = { $inc: { wishlistCount: 1 } };
  if (pushToken) {
    updateOps.$addToSet = { wishlistPushTokens: pushToken };
  }

  const result = await collections.items.updateOne(
    { _id: itemId },
    updateOps
  );

  if (result.matchedCount === 0) {
    throw new Error(`Item not found: ${itemId}`);
  }

  console.log(`[Wishlist] Added wishlist to item ${itemId} (pushToken: ${pushToken ? 'yes' : 'no'})`);
  return true;
}

/**
 * Remove a push token from an item's wishlistPushTokens array.
 * @param itemId - The MongoDB ObjectId of the item
 * @param pushToken - The Expo push token to remove
 */
export async function removeWishlistPushToken(itemId: ObjectId, pushToken?: string): Promise<boolean> {
  await connectToDatabase();

  if (!collections.items) {
    throw new Error('Items collection not initialized');
  }

  const updateOps: any = { $inc: { wishlistCount: -1 } };
  if (pushToken) {
    updateOps.$pull = { wishlistPushTokens: pushToken };
  }

  const result = await collections.items.updateOne(
    { _id: itemId },
    updateOps
  );

  if (result.matchedCount === 0) {
    throw new Error(`Item not found: ${itemId}`);
  }

  console.log(`[Wishlist] Removed wishlist from item ${itemId} (pushToken: ${pushToken ? 'yes' : 'no'})`);
  return true;
}

/**
 * Bulk add or remove a push token across multiple items.
 * Does NOT change wishlistCount — used only for notification preference toggling.
 * @param itemIds - Array of MongoDB ObjectIds
 * @param pushToken - The Expo push token
 * @param action - 'add' or 'remove'
 */
export async function bulkSyncWishlistPushToken(
  itemIds: ObjectId[],
  pushToken: string,
  action: 'add' | 'remove'
): Promise<number> {
  await connectToDatabase();

  if (!collections.items) {
    throw new Error('Items collection not initialized');
  }

  if (itemIds.length === 0) return 0;

  // Ensure wishlistPushTokens is an array (may be null on older documents)
  if (action === 'add') {
    await collections.items.updateMany(
      { _id: { $in: itemIds }, wishlistPushTokens: null },
      { $set: { wishlistPushTokens: [] } }
    );
  }

  const updateOp = action === 'add'
    ? { $addToSet: { wishlistPushTokens: pushToken } }
    : { $pull: { wishlistPushTokens: pushToken } };

  const result = await collections.items.updateMany(
    { _id: { $in: itemIds } },
    updateOp as any
  );

  console.log(`[Wishlist] Bulk ${action} push token across ${result.modifiedCount}/${itemIds.length} item(s)`);
  return result.modifiedCount;
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
