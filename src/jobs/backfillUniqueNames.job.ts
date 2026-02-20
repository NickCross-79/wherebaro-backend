import { collections, connectToDatabase } from "../db/database.service";
import Items from "@wfcd/items";
import { MANUAL_UNIQUE_NAME_MAP } from "../utils/itemMappings";
import { WfcdItem } from "../types/WfcdItem";

/**
 * Normalize a name for fuzzy matching:
 * - Strip quantity prefixes like "5 x " or "10 x "
 * - Strip parenthetical suffixes like "(Operator)"
 * - Strip "Blueprint" suffix
 * - Strip "Left " / "Right " prefixes
 * - Replace "Relic" suffix with "Intact" (wfcd stores relics as "Axi A5 Intact")
 * - Lowercase
 */
function normalizeName(name: string): string {
    let n = name.trim();
    // Strip quantity prefix: "5 x ", "10 x ", etc.
    n = n.replace(/^\d+\s*x\s+/i, "");
    // Strip parenthetical suffixes: "(Operator)", "(Drifter)", etc.
    n = n.replace(/\s*\([^)]*\)\s*$/, "");
    // Strip "Blueprint" suffix
    n = n.replace(/\s+Blueprint$/i, "");
    // Strip "Left " / "Right " prefix
    n = n.replace(/^(Left|Right)\s+/i, "");
    // Replace "Relic" suffix with "Intact"
    n = n.replace(/\s+Relic$/i, " Intact");
    return n.toLowerCase().trim();
}

/**
 * Attempt multiple matching strategies against the wfcd name map.
 * Returns the matched WfcdItem or null.
 */
function findWfcdMatch(
    dbItemName: string,
    wfcdByExactName: Map<string, WfcdItem>,
    wfcdByNormalized: Map<string, WfcdItem>,
    allWfcdItems: WfcdItem[]
): WfcdItem | null {
    const lower = dbItemName.toLowerCase();

    // Strategy 1: Exact name match (case-insensitive)
    const exact = wfcdByExactName.get(lower);
    if (exact) return exact;

    // Strategy 2: Normalized name match
    const normalized = normalizeName(dbItemName);
    const normMatch = wfcdByNormalized.get(normalized);
    if (normMatch) return normMatch;

    // Strategy 3: Contains match — find wfcd item whose name is contained in DB name
    // (handles cases like "5 x Corrupted Bombard Specter" containing "Corrupted Bombard Specter")
    const containsMatch = allWfcdItems.find(
        (item) => lower.includes(item.name.toLowerCase()) && item.name.length > 3
    );
    if (containsMatch) return containsMatch;

    // Strategy 4: Manual mapping for items not in @wfcd/items
    const manualUniqueName = MANUAL_UNIQUE_NAME_MAP[lower];
    if (manualUniqueName) {
        return { name: dbItemName, uniqueName: manualUniqueName } as WfcdItem;
    }

    return null;
}

/**
 * Backfills the uniqueName field on all items in the DB that don't have one.
 * Uses the @wfcd/items library to match items by name and write the full uniqueName.
 */
export async function backfillUniqueNames() {
    await connectToDatabase();

    if (!collections.items) {
        throw new Error("Items collection not initialized");
    }

    // Load all wfcd items once and build lookup maps
    const wfcdItems = new Items() as unknown as WfcdItem[];

    const wfcdByExactName = new Map<string, WfcdItem>();
    const wfcdByNormalized = new Map<string, WfcdItem>();
    const allWfcdItems: WfcdItem[] = [];

    for (const item of wfcdItems) {
        if (item.name && item.uniqueName) {
            wfcdByExactName.set(item.name.toLowerCase(), item);
            wfcdByNormalized.set(normalizeName(item.name), item);
            allWfcdItems.push(item);
        }
    }

    console.log(`[Backfill] Loaded ${wfcdByExactName.size} items from @wfcd/items library`);

    // Find all DB items missing a uniqueName
    const itemsToUpdate = await collections.items
        .find({ $or: [{ uniqueName: { $exists: false } }, { uniqueName: null }, { uniqueName: "" }] })
        .toArray();

    console.log(`[Backfill] Found ${itemsToUpdate.length} items without uniqueName`);

    let matched = 0;
    let unmatched = 0;
    const unmatchedNames: string[] = [];

    for (const dbItem of itemsToUpdate) {
        const itemName = (dbItem as any).name as string;
        if (!itemName) {
            unmatched++;
            continue;
        }

        const wfcdMatch = findWfcdMatch(itemName, wfcdByExactName, wfcdByNormalized, allWfcdItems);

        if (wfcdMatch) {
            await collections.items.updateOne(
                { _id: dbItem._id },
                { $set: { uniqueName: wfcdMatch.uniqueName } }
            );
            matched++;
        } else {
            unmatched++;
            unmatchedNames.push(itemName);
        }
    }

    console.log(`[Backfill] Results: ${matched} matched, ${unmatched} unmatched`);
    if (unmatchedNames.length > 0) {
        console.log(`[Backfill] Unmatched items: ${unmatchedNames.join(", ")}`);
    }

    return {
        total: itemsToUpdate.length,
        matched,
        unmatched,
        unmatchedNames
    };
}
