import { ObjectId } from "mongodb";
import { addWishlistPushToken, removeWishlistPushToken } from "../services/wishlistService";

export interface WishlistPushTokenPayload {
    item_oid: string;
    pushToken: string;
}

export async function addWishlistPushTokenJob(payload: WishlistPushTokenPayload): Promise<boolean> {
    const itemId = new ObjectId(payload.item_oid);
    return addWishlistPushToken(itemId, payload.pushToken);
}

export async function removeWishlistPushTokenJob(payload: WishlistPushTokenPayload): Promise<boolean> {
    const itemId = new ObjectId(payload.item_oid);
    return removeWishlistPushToken(itemId, payload.pushToken);
}
