import { collections, connectToDatabase } from "../db/database.service";
import Vote from "../models/Vote";
import { ObjectId } from "mongodb";

/**
 * Cast or update a buy/skip vote for an item.
 * Uses upsert so each user can only have one vote per item.
 * Pushes the vote OID into the Item's buy[] or skip[] array
 * (and pulls from the other array if switching).
 */
export async function castVote(itemId: ObjectId, uid: string, voteType: "buy" | "skip"): Promise<Vote> {
    await connectToDatabase();

    if (!collections.votes) throw new Error("Votes collection not initialized");
    if (!collections.items) throw new Error("Items collection not initialized");

    // Check if user already has a vote for this item
    const existing = await collections.votes.findOne({ item_oid: itemId, uid });
    const oldType = existing?.voteType as "buy" | "skip" | undefined;
    const oldId = existing?._id;

    // Upsert the vote document
    const result = await collections.votes.findOneAndUpdate(
        { item_oid: itemId, uid },
        { $set: { item_oid: itemId, uid, voteType } },
        { upsert: true, returnDocument: "after" }
    );
    const vote = result as unknown as Vote;
    const voteId = vote._id!.toString();

    // If switching vote types, pull the old ID from the old array
    if (oldType && oldType !== voteType && oldId) {
        await collections.items.updateOne(
            { _id: itemId },
            { $pull: { [oldType]: oldId.toString() } } as any
        );
    }

    // Push the vote ID into the correct array (use $addToSet to avoid duplicates)
    await collections.items.updateOne(
        { _id: itemId },
        { $addToSet: { [voteType]: voteId } } as any
    );

    return vote;
}

/**
 * Remove a user's vote for an item.
 */
export async function removeVote(itemId: ObjectId, uid: string): Promise<boolean> {
    await connectToDatabase();

    if (!collections.votes) throw new Error("Votes collection not initialized");
    if (!collections.items) throw new Error("Items collection not initialized");

    const vote = await collections.votes.findOne({ item_oid: itemId, uid });
    if (!vote) return false;

    await collections.votes.deleteOne({ _id: vote._id, uid });
    // Pull from the appropriate array on the item
    await collections.items.updateOne(
        { _id: itemId },
        { $pull: { [vote.voteType]: vote._id!.toString() } } as any
    );
    return true;
}

/**
 * Fetch votes for an item.
 * Returns the vote documents so the frontend can check if the current user voted.
 */
export async function getVotesForItem(itemId: ObjectId): Promise<{ buyCount: number; skipCount: number; votes: Vote[] }> {
    await connectToDatabase();

    if (!collections.votes) throw new Error("Votes collection not initialized");

    const votes = await collections.votes
        .find({ item_oid: itemId })
        .toArray() as Vote[];
    const buyCount = votes.filter(v => v.voteType === "buy").length;
    const skipCount = votes.filter(v => v.voteType === "skip").length;
    return { buyCount, skipCount, votes };
}
