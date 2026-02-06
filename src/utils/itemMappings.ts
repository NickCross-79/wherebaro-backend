/**
 * Manual uniqueName mappings for items that can't be resolved
 * through the @wfcd/items library by name alone.
 * Maps DB item name (lowercase) -> full uniqueName path.
 *
 * TODO: Add mappings once uniqueNames become available:
 *  - "3 day credit booster"
 *  - "nexus gene-masking kit"
 *  - "eos prime armor set"
 */
export const MANUAL_UNIQUE_NAME_MAP: Record<string, string> = {
    "3 day mod drop chance booster": "/Lotus/Types/StoreItems/Boosters/ModDropChanceBoosterStoreItem",
    "3 day resource booster": "/Lotus/Types/StoreItems/Boosters/ResourceDropChanceBoosterStoreItem",
    "3 day affinity booster": "/Lotus/Types/StoreItems/Boosters/AffinityBoosterStoreItem",
    "ki'teer domestik drone": "/Lotus/Types/Items/ShipDecos/LisetPropCleaningDroneBaro",
    "atrox gene-masking kit": "/Lotus/Types/StoreItems/Packages/KubrowColorPackDiamond",
};

/**
 * Items to ignore during Baro inventory processing.
 * These won't be added to the current inventory or the items DB.
 * Matched against the Baro API `item` field (case-insensitive).
 */
export const IGNORED_BARO_ITEMS: string[] = [
    "void surplus",
    "dragon mod pack",
    "falcon mod pack",
];

/**
 * Check if a Baro inventory item name should be ignored.
 */
export function isIgnoredBaroItem(itemName: string): boolean {
    return IGNORED_BARO_ITEMS.includes(itemName.toLowerCase());
}
