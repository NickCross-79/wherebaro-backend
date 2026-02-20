/**
 * Fetches the raw Warframe world state JSON and extracts
 * VoidTrader data directly — no heavy parser needed.
 * Resolves item names via the shared wfcdItems utility.
 */
import { normalizeItemType, resolveItemName } from "../utils/wfcdItems";

const WORLDSTATE_URL = "https://api.warframe.com/cdn/worldState.php";

/**
 * Maps internal world-state node IDs to human-readable relay names.
 * These are the nodes where Baro Ki'Teer can appear.
 */
const NODE_TO_RELAY: Record<string, string> = {
    MercuryHUB: "Larunda Relay (Mercury)",
    VenusHUB: "Vesper Relay (Venus)",
    EarthHUB: "Strata Relay (Earth)",
    SaturnHUB: "Kronia Relay (Saturn)",
    EuropaHUB: "Leonov Relay (Europa)",
    PlutoHUB: "Orcus Relay (Pluto)",
    ErisHUB: "Kuiper Relay (Eris)",
};

/**
 * Resolves a world-state node ID to a human-readable relay name.
 * Falls back to the raw node string if unknown.
 */
function resolveRelayName(node: string): string {
    return NODE_TO_RELAY[node] || node;
}

/**
 * Parses a MongoDB Extended JSON date field into an ISO string.
 * Handles both `{ $date: { $numberLong: "..." } }` and plain timestamps.
 */
function parseDate(field: any): string {
    if (!field) return new Date(0).toISOString();
    const ms = field?.$date?.$numberLong;
    if (ms) return new Date(Number(ms)).toISOString();
    if (typeof field === "number") return new Date(field).toISOString();
    return String(field);
}

/**
 * Fetches the raw Warframe world state and extracts VoidTrader data
 * directly from the JSON — avoids the slow full-parse of warframe-worldstate-parser.
 * @returns The VoidTrader data from the world state.
 */
export async function fetchWorldStateTrader(): Promise<WorldStateTrader> {
    const response = await fetch(WORLDSTATE_URL);
    if (!response.ok) {
        throw new Error(`World state API error: ${response.status} ${response.statusText}`);
    }

    const worldState = await response.json();
    const rawTrader = worldState.VoidTraders?.[0];

    if (!rawTrader) {
        throw new Error("No VoidTrader data found in world state");
    }

    return {
        id: rawTrader._id?.$oid || rawTrader._id,
        activation: parseDate(rawTrader.Activation),
        expiry: parseDate(rawTrader.Expiry),
        character: rawTrader.Character,
        location: resolveRelayName(rawTrader.Node || ""),
        inventory: (rawTrader.Manifest || []).map((item: any) => ({
            uniqueName: normalizeItemType(item.ItemType || ""),
            item: resolveItemName(item.ItemType || ""),
            ducats: item.PrimePrice ?? 0,
            credits: item.RegularPrice ?? 0,
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
