import { collections, connectToDatabase } from "../db/database.service";
import Like from "../models/Like";
import { ObjectId } from "mongodb";

/**
 * Adds a like and stores the like id on the item
 */
export async function addLike(itemId: ObjectId, uid: string): Promise<Like> {
    await connectToDatabase();

    if (!collections.likes) {
        throw new Error("Likes collection not initialized");
    }

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const like = new Like(undefined, itemId, uid);
    const result = await collections.likes.insertOne(like);
    const likeId = result.insertedId;

    await collections.items.updateOne(
        { _id: itemId },
        { $push: { likes: likeId.toString() } } as any
    );

    like._id = likeId;
    return like;
}

/**
 * Removes a like and removes the like id from the item
 */
export async function removeLike(itemId: ObjectId, uid: string): Promise<boolean> {
    await connectToDatabase();

    if (!collections.likes) {
        throw new Error("Likes collection not initialized");
    }

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const like = await collections.likes.findOne({ item_oid: itemId, uid });

    if (!like) {
        return false;
    }

    await collections.likes.deleteOne({ _id: like._id, uid });

    await collections.items.updateOne(
        { _id: itemId },
        { $pull: { likes: like._id.toString() } } as any
    );

    return true;
}

/**
 * Fetches all likes for a specific item
 * @param itemId The MongoDB ObjectId of the item
 * @returns Array of Like objects for that item
 */
export async function getLikesForItem(itemId: ObjectId): Promise<Like[]> {
    await connectToDatabase();
    
    if (!collections.likes) {
        throw new Error("Likes collection not initialized");
    }

    const likes = await collections.likes
        .find({ item_oid: itemId })
        .toArray();

    console.log(`Fetched ${likes.length} likes for item ${itemId}`);
    
    return likes as Like[];
}
