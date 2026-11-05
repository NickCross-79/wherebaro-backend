/**
 * Public views of per-user documents (reviews, likes, votes).
 *
 * A device's uid is the only thing that proves who wrote a review or cast a
 * like/vote: edit, delete, unlike and remove-vote all trust it. Returning other
 * people's uids from the read endpoints therefore let anyone act as them.
 *
 * These helpers strip the uid and replace it with `isOwn`, computed against
 * the uid of the device asking, so the app can still recognise its own entries
 * without ever seeing anyone else's.
 */

export type PublicView<T> = Omit<T, "uid"> & { isOwn: boolean };

/**
 * Returns `docs` without their `uid`, each marked with whether it belongs to
 * `viewerUid`. With no viewer uid, nothing is marked as own.
 */
export function withOwnership<T extends { uid?: unknown }>(docs: T[], viewerUid?: string): PublicView<T>[] {
    return docs.map(({ uid, ...rest }) => ({
        ...rest,
        isOwn: typeof viewerUid === "string" && viewerUid.length > 0 && uid === viewerUid,
    }));
}

/**
 * Reads the viewer's uid from a parsed request body. Only a non-empty string
 * counts; anything else means "anonymous viewer".
 */
export function viewerUidFrom(body: unknown): string | undefined {
    const uid = (body as { uid?: unknown } | null | undefined)?.uid;
    return typeof uid === "string" && uid.length > 0 ? uid : undefined;
}
