import { ObjectId } from "mongodb";
import Like from "../models/Like.js";
import { addLike, removeLike } from "../services/likeService.js";

export interface LikePayload {
    item_oid: string;
    uid: string;
}

export async function likeJob(payload: LikePayload): Promise<Like> {
    const itemId = new ObjectId(payload.item_oid);
    return addLike(itemId, payload.uid);
}

export async function unlikeJob(payload: LikePayload): Promise<boolean> {
    const itemId = new ObjectId(payload.item_oid);
    return removeLike(itemId, payload.uid);
}
