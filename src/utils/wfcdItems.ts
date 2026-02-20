/**
 * Centralized @wfcd/items utility.
 * All lookups, matching, and name resolution against the wfcd dataset
 * flow through this module, sharing a single lazily-loaded cache.
 */
import Items from "@wfcd/items";
import { MANUAL_UNIQUE_NAME_MAP } from "./itemMappings";

// ─── WfcdItem Interface ──────────────────────────────────────────────────────

export interface WfcdItem {
    name: string;
    uniqueName: string;
    imageName?: string;
    type?: string;
    category?: string;
    description?: string;
}

// ─── Shared Cache ────────────────────────────────────────────────────────────

let wfcdItemsCache: WfcdItem[] | null = null;

/** Returns the lazily-loaded @wfcd/items dataset. */
export function getWfcdItems(): WfcdItem[] {
    if (!wfcdItemsCache) {
        wfcdItemsCache = new Items() as unknown as WfcdItem[];
    }
    return wfcdItemsCache;
}

// ─── Suffix Lookup ───────────────────────────────────────────────────────────

/**
 * Extracts the last segment from a uniqueName path.
 * e.g. "/Lotus/StoreItems/Types/Items/ShipDecos/Foo" → "Foo"
 */
export function getUniqueNameSuffix(uniqueName: string): string {
    return uniqueName.split("/").pop() || uniqueName;
}

/**
 * Looks up a Warframe item by the last segment of its uniqueName
 * using the @wfcd/items library.
 */
export function lookupWfcdItem(suffix: string): WfcdItem | null {
    return (
        getWfcdItems().find(
            (item) => item.uniqueName?.endsWith(`/${suffix}`)
        ) ?? null
    );
}

// ─── Name Resolution (World State) ──────────────────────────────────────────

let nameByUniqueName: Map<string, string> | null = null;

/**
 * Strips the `/StoreItems` segment from a raw world state ItemType path
 * so it matches the @wfcd/items uniqueName format.
 * e.g. "/Lotus/StoreItems/Upgrades/Mods/..." → "/Lotus/Upgrades/Mods/..."
 */
export function normalizeItemType(itemType: string): string {
    return itemType.replace("/StoreItems", "");
}

/**
 * Resolves a raw ItemType to a human-readable name using @wfcd/items.
 * Falls back to the last path segment if no match is found.
 */
export function resolveItemName(itemType: string): string {
    if (!nameByUniqueName) {
        nameByUniqueName = new Map();
        for (const item of getWfcdItems()) {
            if (item.uniqueName && item.name) {
                nameByUniqueName.set(item.uniqueName.toLowerCase(), item.name);
            }
        }
    }

    const normalized = normalizeItemType(itemType).toLowerCase();
    return nameByUniqueName.get(normalized) || itemType.split("/").pop() || itemType;
}

// ─── Fuzzy Name Matching (Backfill) ─────────────────────────────────────────

/**
 * Normalize a name for fuzzy matching:
 * - Strip quantity prefixes like "5 x " or "10 x "
 * - Strip parenthetical suffixes like "(Operator)"
 * - Strip "Blueprint" suffix
 * - Strip "Left " / "Right " prefixes
 * - Replace "Relic" suffix with "Intact" (wfcd stores relics as "Axi A5 Intact")
 * - Lowercase
 */
export function normalizeName(name: string): string {
    let n = name.trim();
    n = n.replace(/^\d+\s*x\s+/i, "");
    n = n.replace(/\s*\([^)]*\)\s*$/, "");
    n = n.replace(/\s+Blueprint$/i, "");
    n = n.replace(/^(Left|Right)\s+/i, "");
    n = n.replace(/\s+Relic$/i, " Intact");
    return n.toLowerCase().trim();
}

/**
 * Builds name lookup maps from the wfcd dataset for use with findWfcdMatch.
 */
export function buildWfcdNameMaps(): {
    wfcdByExactName: Map<string, WfcdItem>;
    wfcdByNormalized: Map<string, WfcdItem>;
    allWfcdItems: WfcdItem[];
} {
    const wfcdByExactName = new Map<string, WfcdItem>();
    const wfcdByNormalized = new Map<string, WfcdItem>();
    const allWfcdItems: WfcdItem[] = [];

    for (const item of getWfcdItems()) {
        if (item.name && item.uniqueName) {
            wfcdByExactName.set(item.name.toLowerCase(), item);
            wfcdByNormalized.set(normalizeName(item.name), item);
            allWfcdItems.push(item);
        }
    }

    return { wfcdByExactName, wfcdByNormalized, allWfcdItems };
}

/**
 * Attempt multiple matching strategies against the wfcd name map.
 * Returns the matched WfcdItem or null.
 */
export function findWfcdMatch(
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
