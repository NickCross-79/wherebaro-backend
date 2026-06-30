/**
 * Admin device lookup: given a device id (the locally-generated UID that the
 * user app stores and also sends as `uid` on reviews/likes/votes and as
 * `deviceId` on push tokens), gather everything linked to that device.
 */
import { collections, connectToDatabase } from "../db/database.service";
import { ObjectId } from "mongodb";

export interface DeviceReview {
    _id: string;
    item_oid: string;
    itemName: string;
    user: string;
    content: string;
    date: string;
    time: string;
    reportCount: number;
}

export interface DeviceItemRef {
    item_oid: string;
    itemName: string;
}

export interface DeviceVote extends DeviceItemRef {
    voteType: string;
}

export interface DevicePushToken {
    token: string;
    isActive: boolean;
    notifyArrival?: boolean;
    notifyDeparture?: boolean;
    createdAt?: string;
    lastUsed?: string;
}

export interface DeviceProfile {
    deviceId: string;
    found: boolean;
    counts: {
        reviews: number;
        likes: number;
        votes: number;
        pushTokens: number;
        wishlist: number;
    };
    pushTokens: DevicePushToken[];
    reviews: DeviceReview[];
    likes: DeviceItemRef[];
    votes: DeviceVote[];
    wishlist: DeviceItemRef[];
}

/** Resolve item_oids to display names in a single query. */
async function buildItemNameMap(itemOids: ObjectId[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (itemOids.length === 0 || !collections.items) return map;

    const items = await collections.items
        .find({ _id: { $in: itemOids } })
        .project({ name: 1 })
        .toArray();

    for (const item of items) {
        map.set(item._id.toString(), item.name || "Unknown item");
    }
    return map;
}

export async function getDeviceProfile(deviceId: string): Promise<DeviceProfile> {
    await connectToDatabase();

    const trimmed = (deviceId ?? "").trim();
    if (!trimmed) {
        throw new Error("Device ID is required");
    }

    if (!collections.reviews || !collections.likes || !collections.votes || !collections.pushTokens || !collections.items) {
        throw new Error("Collections not initialized");
    }

    const [reviewDocs, likeDocs, voteDocs, pushTokenDocs] = await Promise.all([
        collections.reviews.find({ uid: trimmed }).sort({ date: -1 }).toArray(),
        collections.likes.find({ uid: trimmed }).toArray(),
        collections.votes.find({ uid: trimmed }).toArray(),
        collections.pushTokens.find({ deviceId: trimmed }).toArray(),
    ]);

    // Wishlist: items carry the user's Expo push token in wishlistPushTokens.
    const tokens = pushTokenDocs.map((t) => t.token).filter(Boolean);
    const wishlistDocs = tokens.length
        ? await collections.items
              .find({ wishlistPushTokens: { $in: tokens } })
              .project({ name: 1 })
              .toArray()
        : [];

    // Resolve item names for everything that references an item_oid.
    const refOids = [
        ...reviewDocs.map((r) => r.item_oid),
        ...likeDocs.map((l) => l.item_oid),
        ...voteDocs.map((v) => v.item_oid),
    ]
        .filter(Boolean)
        .map((id) => (typeof id === "string" ? new ObjectId(id) : id));
    const nameMap = await buildItemNameMap(refOids);
    const nameOf = (oid: any) => nameMap.get(oid?.toString()) ?? "Unknown item";

    const reviews: DeviceReview[] = reviewDocs.map((r) => ({
        _id: r._id.toString(),
        item_oid: r.item_oid?.toString() ?? "",
        itemName: nameOf(r.item_oid),
        user: r.user,
        content: r.content,
        date: r.date,
        time: r.time,
        reportCount: r.reportCount ?? 0,
    }));

    const likes: DeviceItemRef[] = likeDocs.map((l) => ({
        item_oid: l.item_oid?.toString() ?? "",
        itemName: nameOf(l.item_oid),
    }));

    const votes: DeviceVote[] = voteDocs.map((v) => ({
        item_oid: v.item_oid?.toString() ?? "",
        itemName: nameOf(v.item_oid),
        voteType: v.voteType,
    }));

    const wishlist: DeviceItemRef[] = wishlistDocs.map((w) => ({
        item_oid: w._id.toString(),
        itemName: w.name || "Unknown item",
    }));

    const pushTokens: DevicePushToken[] = pushTokenDocs.map((t) => ({
        token: t.token,
        isActive: t.isActive ?? false,
        notifyArrival: t.notifyArrival,
        notifyDeparture: t.notifyDeparture,
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : undefined,
        lastUsed: t.lastUsed ? new Date(t.lastUsed).toISOString() : undefined,
    }));

    return {
        deviceId: trimmed,
        found:
            reviews.length > 0 ||
            likes.length > 0 ||
            votes.length > 0 ||
            pushTokens.length > 0 ||
            wishlist.length > 0,
        counts: {
            reviews: reviews.length,
            likes: likes.length,
            votes: votes.length,
            pushTokens: pushTokens.length,
            wishlist: wishlist.length,
        },
        pushTokens,
        reviews,
        likes,
        votes,
        wishlist,
    };
}
