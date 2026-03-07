import { ObjectId } from "mongodb";
import Vote from "../models/Vote";
import { castVote, removeVote, getVotesForItem } from "../services/voteService";

export interface VotePayload {
    item_oid: string;
    uid: string;
    voteType: "buy" | "skip";
}

export async function voteJob(payload: VotePayload): Promise<Vote> {
    const itemId = new ObjectId(payload.item_oid);
    return castVote(itemId, payload.uid, payload.voteType);
}

export async function removeVoteJob(payload: { item_oid: string; uid: string }): Promise<boolean> {
    const itemId = new ObjectId(payload.item_oid);
    return removeVote(itemId, payload.uid);
}

export async function getVotesJob(itemOid: string): Promise<{ buyCount: number; skipCount: number; votes: Vote[] }> {
    const itemId = new ObjectId(itemOid);
    return getVotesForItem(itemId);
}
