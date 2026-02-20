/**
 * Shared type for items from the @wfcd/items library.
 * Used by itemService (inventory resolution) and
 * backfillUniqueNames job (name matching).
 */
export interface WfcdItem {
    name: string;
    uniqueName: string;
    imageName?: string;
    type?: string;
    category?: string;
    description?: string;
}
