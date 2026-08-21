/**
 * Job: Item Duplicates Report (read-only)
 *
 * Finds items stored more than once in the items collection. A duplicate is
 * created whenever the Baro resolution path fails to recognise an item that is
 * already there — the new document starts with `offeringDates: [today]`, and a
 * single offering date is exactly what the app renders as a NEW badge, so a
 * long-standing item resurfaces flagged as never seen before.
 *
 * Groups by two notions of sameness:
 *   - normalized name  (case, quantity prefixes, parentheticals, Blueprint suffix)
 *   - uniqueName key   (ignoring the /Lotus/ vs /Lotus/StoreItems/ prefix)
 *
 * Reports only. Nothing here writes, so it is safe to run against production at
 * any time; merging duplicates is a separate decision with real data attached
 * (likes, reviews, wishlist tokens live on these documents).
 */
import { collections, connectToDatabase } from "../db/database.service";
import { getUniqueNameKey, normalizeName } from "../utils/wfcdItems";

interface DuplicateEntry {
    _id: string;
    name: string;
    uniqueName: string | null;
    offeringDates: string[];
    offeringCount: number;
    likes: number;
    reviews: number;
    /** True when the app would currently render a NEW badge for this document. */
    showsAsNew: boolean;
}

interface DuplicateGroup {
    groupedBy: "name" | "uniqueName";
    key: string;
    entries: DuplicateEntry[];
}

function toEntry(doc: any): DuplicateEntry {
    const offeringDates: string[] = Array.isArray(doc.offeringDates) ? doc.offeringDates : [];
    return {
        _id: String(doc._id),
        name: doc.name ?? "",
        uniqueName: doc.uniqueName ?? null,
        offeringDates,
        offeringCount: offeringDates.length,
        likes: Array.isArray(doc.likes) ? doc.likes.length : 0,
        reviews: Array.isArray(doc.reviews) ? doc.reviews.length : 0,
        showsAsNew: offeringDates.length === 1,
    };
}

export async function itemDuplicatesReportJob() {
    await connectToDatabase();

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    const allItems = await collections.items.find({}).toArray();

    const byName = new Map<string, any[]>();
    const byKey = new Map<string, any[]>();

    for (const doc of allItems) {
        const name = (doc as any).name;
        if (name) {
            const key = normalizeName(name);
            if (key) byName.set(key, [...(byName.get(key) ?? []), doc]);
        }

        const uniqueName = (doc as any).uniqueName;
        if (uniqueName) {
            const key = getUniqueNameKey(uniqueName);
            if (key) byKey.set(key, [...(byKey.get(key) ?? []), doc]);
        }
    }

    const groups: DuplicateGroup[] = [];
    const seenIdSets = new Set<string>();

    const collect = (map: Map<string, any[]>, groupedBy: "name" | "uniqueName") => {
        for (const [key, docs] of map) {
            if (docs.length < 2) continue;
            // Skip a group already reported under the other grouping
            const signature = docs.map((d) => String(d._id)).sort().join(",");
            if (seenIdSets.has(signature)) continue;
            seenIdSets.add(signature);
            groups.push({ groupedBy, key, entries: docs.map(toEntry) });
        }
    };

    collect(byName, "name");
    collect(byKey, "uniqueName");

    // Most interesting first: groups where one side is showing a false NEW badge
    groups.sort((a, b) => {
        const aNew = a.entries.some((e) => e.showsAsNew) ? 1 : 0;
        const bNew = b.entries.some((e) => e.showsAsNew) ? 1 : 0;
        return bNew - aNew;
    });

    const flaggedNew = groups.filter((g) => g.entries.some((e) => e.showsAsNew));

    console.log(
        `[Duplicates] Scanned ${allItems.length} items — ` +
        `${groups.length} duplicate group(s), ${flaggedNew.length} showing a NEW badge`
    );

    return {
        totalItems: allItems.length,
        duplicateGroups: groups.length,
        groupsShowingFalseNew: flaggedNew.length,
        groups,
    };
}
