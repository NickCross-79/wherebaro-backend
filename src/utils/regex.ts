/**
 * Escapes a string for safe use inside a RegExp literal.
 * Shared so every case-insensitive name lookup against the items collection
 * builds its pattern the same way.
 */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
