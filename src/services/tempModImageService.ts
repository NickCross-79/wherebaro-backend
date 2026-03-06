/**
 * Service for managing the `tempModImages` collection.
 *
 * When a new Baro visit introduces a mod item that has never been seen before,
 * a generated PNG is stored here (keyed by the item's `_id` in the `items`
 * collection) so the frontend can display something useful while the wiki sync
 * job hasn't yet provided the official image.
 *
 * The item's `image` field in `items` is set to `MOD_IMAGE_SENTINEL` at
 * insertion time. Callers that serve inventory to the frontend (e.g.
 * `getCurrentJob`) should call `resolveModImageSentinels` to swap the sentinel
 * for the real data URI before returning the response.
 */
import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Sentinel value stored in an item's `image` field to indicate that a generated
 * mod image exists in the `tempModImages` collection for this item.
 */
export const MOD_IMAGE_SENTINEL = "temp:modImage";

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Persists a generated mod image for a newly inserted mod item.
 * Upserts a document `{ itemId, imageData }` into `tempModImages`.
 *
 * @param itemId  - The `_id` of the item in the `items` collection.
 * @param base64Image - The generated PNG encoded as a base64 string.
 */
export async function storeTempModImage(itemId: ObjectId, base64Image: string): Promise<void> {
    await connectToDatabase();

    if (!collections.tempModImages) {
        throw new Error("tempModImages collection not initialized");
    }

    await collections.tempModImages.updateOne(
        { itemId },
        { $set: { itemId, imageData: base64Image } },
        { upsert: true }
    );
}

/**
 * Replaces the `MOD_IMAGE_SENTINEL` image field on any inventory items with a
 * `data:image/png;base64,…` URI resolved from the `tempModImages` collection.
 * Items without the sentinel are returned unchanged.
 *
 * Performs a single batch query rather than one query per sentinel item.
 *
 * @param items - Array of fully-populated item documents.
 * @returns The same array with sentinel values replaced where a temp image exists.
 */
export async function resolveModImageSentinels(items: any[]): Promise<any[]> {
    await connectToDatabase();

    const sentinelItems = items.filter((item) => item.image === MOD_IMAGE_SENTINEL);
    if (sentinelItems.length === 0 || !collections.tempModImages) {
        console.log("[resolveModImageSentinels] No sentinel items or tempModImages collection unavailable, returning items unchanged");
        return items;
    }

    const sentinelIds = sentinelItems.map((item) => item._id);
    const tempDocs = await collections.tempModImages
        .find({ itemId: { $in: sentinelIds } })
        .toArray();

    const tempImageMap = new Map<string, string>();
    for (const doc of tempDocs) {
        tempImageMap.set(doc.itemId.toString(), doc.imageData);
    }

    return items.map((item) => {
        if (item.image === MOD_IMAGE_SENTINEL) {
            const imageData = tempImageMap.get(item._id.toString());
            if (imageData) {
                return { ...item, image: `data:image/png;base64,${imageData}` };
            }
        }
        return item;
    });
}