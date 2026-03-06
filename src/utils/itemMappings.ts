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
    "dragon mod pack",
    "falcon mod pack",
];

/**
 * Items to exclude from wiki scraping and database seeding.
 * These items will be skipped during seedDB and syncItems operations.
 * Add item names here that should not be inserted into the database.
 */
export const WIKI_EXCLUDED_ITEMS: string[] = [
    "falcon mod pack",
    "dragon mod pack",
    "left elixis latron shoulder plate",
    "elixis latron leg plate",
    "elixis latron chest plate",
    "koi sentinel tail",
    "orokin catalyst",
    "axi a8"
];

/**
 * Permanent items that appear in Baro's inventory every week.
 * These items should not display offering dates or "last brought" information.
 */
export const PERMANENT_BARO_ITEMS: string[] = [
    "void surplus",
];

/**
 * Check if a Baro inventory item name should be ignored.
 */
export function isIgnoredBaroItem(itemName: string): boolean {
    return IGNORED_BARO_ITEMS.includes(itemName.toLowerCase());
}

/**
 * Check if an item should be excluded from wiki scraping/DB seeding.
 */
export function isWikiExcludedItem(itemName: string): boolean {
    return WIKI_EXCLUDED_ITEMS.includes(itemName.toLowerCase());
}

/**
 * Check if an item is permanent (appears every week).
 */
export function isPermanentBaroItem(itemName: string): boolean {
    return PERMANENT_BARO_ITEMS.includes(itemName.toLowerCase());
}
