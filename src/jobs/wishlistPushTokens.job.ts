import { ObjectId } from "mongodb";
import { addWishlistPushToken, removeWishlistPushToken, bulkSyncWishlistPushToken } from "../services/wishlistService";

export interface WishlistPushTokenPayload {
    item_oid: string;
    pushToken?: string;
}

export interface BulkWishlistSyncPayload {
    item_oids: string[];
    pushToken: string;
    action: 'add' | 'remove';
}

export async function addWishlistPushTokenJob(payload: WishlistPushTokenPayload): Promise<boolean> {
    const itemId = new ObjectId(payload.item_oid);
    return addWishlistPushToken(itemId, payload.pushToken);
}

export async function removeWishlistPushTokenJob(payload: WishlistPushTokenPayload): Promise<boolean> {
    const itemId = new ObjectId(payload.item_oid);
    return removeWishlistPushToken(itemId, payload.pushToken);
}

export async function bulkSyncWishlistPushTokenJob(payload: BulkWishlistSyncPayload): Promise<number> {
    const itemIds = payload.item_oids.map(id => new ObjectId(id));
    return bulkSyncWishlistPushToken(itemIds, payload.pushToken, payload.action);
}
