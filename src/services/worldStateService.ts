/**
 * Thin wrapper around warframe-worldstate-parser.
 * Isolates the ESM dynamic import so the rest of the codebase
 * (and Jest) can work with standard CJS require resolution.
 */

const WORLDSTATE_URL = "https://api.warframe.com/cdn/worldState.php";

/**
 * Fetches the raw Warframe world state and parses it
 * using warframe-worldstate-parser.
 * @returns The parsed VoidTrader data from the world state.
 */
export async function fetchWorldStateTrader(): Promise<WorldStateTrader> {
    const { WorldState } = await import("warframe-worldstate-parser");

    const response = await fetch(WORLDSTATE_URL);
    if (!response.ok) {
        throw new Error(`World state API error: ${response.status} ${response.statusText}`);
    }

    const worldStateText = await response.text();
    const worldState = await WorldState.build(worldStateText);
    const trader = worldState.voidTraders?.[0];

    if (!trader) {
        throw new Error("No VoidTrader data found in world state");
    }

    return {
        id: trader.id,
        activation: trader.activation instanceof Date
            ? trader.activation.toISOString()
            : String(trader.activation),
        expiry: trader.expiry instanceof Date
            ? trader.expiry.toISOString()
            : String(trader.expiry),
        character: trader.character,
        location: trader.location || "",
        inventory: (trader.inventory || []).map((item: any) => ({
            uniqueName: item.uniqueName || "",
            item: item.item || "",
            ducats: item.ducats ?? 0,
            credits: item.credits ?? 0,
        })),
    };
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface WorldStateInventoryItem {
    uniqueName: string;
    item: string;
    ducats: number;
    credits: number;
}

export interface WorldStateTrader {
    id?: string;
    activation: string;
    expiry: string;
    character?: string;
    location: string;
    inventory: WorldStateInventoryItem[];
}
