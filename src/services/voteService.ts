import { collections, connectToDatabase } from "../db/database.service";
import Vote from "../models/Vote";
import { ObjectId } from "mongodb";

/**
 * Cast or update a buy/skip vote for an item.
 * Uses upsert so each user can only have one vote per item.
 */
export async function castVote(itemId: ObjectId, uid: string, voteType: "buy" | "skip"): Promise<Vote> {
    await connectToDatabase();

    if (!collections.votes) {
        throw new Error("Votes collection not initialized");
    }

    const result = await collections.votes.findOneAndUpdate(
        { item_oid: itemId, uid },
        { $set: { item_oid: itemId, uid, voteType } },
        { upsert: true, returnDocument: "after" }
    );

    return result as unknown as Vote;
}

/**
 * Remove a user's vote for an item.
 */
export async function removeVote(itemId: ObjectId, uid: string): Promise<boolean> {
    await connectToDatabase();

    if (!collections.votes) {
        throw new Error("Votes collection not initialized");
    }

    const result = await collections.votes.deleteOne({ item_oid: itemId, uid });
    return result.deletedCount > 0;
}

/**
 * Fetch aggregated vote counts for an item.
 * Returns { buyCount, skipCount }.
 */
export async function getVotesForItem(itemId: ObjectId): Promise<{ buyCount: number; skipCount: number; votes: Vote[] }> {
    await connectToDatabase();

    if (!collections.votes) {
        throw new Error("Votes collection not initialized");
    }

    const votes = await collections.votes
        .find({ item_oid: itemId })
        .toArray() as Vote[];

    const buyCount = votes.filter(v => v.voteType === "buy").length;
    const skipCount = votes.filter(v => v.voteType === "skip").length;

    return { buyCount, skipCount, votes };
}
