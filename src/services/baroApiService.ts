/**
 * Shared Baro Ki'Teer API service.
 * Centralizes all interactions with the Warframestat Baro API,
 * with an automatic fallback to the raw Warframe world state
 * when the primary API is unreliable.
 */
import { fetchWorldStateTrader } from "./worldStateService";

const BARO_API_URL = "https://api.warframestat.us/pc/voidTraders/";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface BaroApiInventoryItem {
    uniqueName: string;
    item: string;
    ducats: number;
    credits: number;
}

export interface BaroApiResponse {
    id?: string;
    activation: string;
    expiry: string;
    character?: string;
    location: string;
    inventory: BaroApiInventoryItem[];
    active?: boolean;
    /** Indicates which data source was used: "warframestat" or "worldstate" */
    source?: "warframestat" | "worldstate";
}

// ─── Primary API ─────────────────────────────────────────────────────────────

/**
 * Fetches Baro data from the primary Warframestat API.
 */
async function fetchFromWarframestat(): Promise<BaroApiResponse> {
    const response = await fetch(BARO_API_URL);
    if (!response.ok) {
        throw new Error(`Warframestat API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const baroData: BaroApiResponse | undefined = Array.isArray(data) ? data[0] : data;
    if (!baroData) {
        throw new Error("Invalid Baro data received from Warframestat API");
    }

    baroData.inventory ??= [];
    baroData.source = "warframestat";
    return baroData;
}

// ─── World State Fallback ────────────────────────────────────────────────────

/**
 * Fetches Baro data by parsing the raw Warframe world state.
 * Used as a fallback when the primary Warframestat API is unreliable.
 */
async function fetchFromWorldState(): Promise<BaroApiResponse> {
    const trader = await fetchWorldStateTrader();

    return {
        id: trader.id,
        activation: trader.activation,
        expiry: trader.expiry,
        character: trader.character,
        location: trader.location,
        inventory: trader.inventory,
        active: isBaroActive(trader.activation, trader.expiry),
        source: "worldstate",
    };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetches Baro data, trying the primary Warframestat API first.
 * Falls back to parsing the raw Warframe world state if the primary API:
 * - Returns an HTTP error or invalid data
 * - Reports Baro as active but returns an empty inventory
 */
export async function fetchBaroData(): Promise<BaroApiResponse> {
    try {
        const data = await fetchFromWarframestat();

        // If Baro appears active but has no inventory, the API may be lagging
        const active = isBaroActive(data.activation, data.expiry);
        if (active && data.inventory.length === 0) {
            console.warn("[Baro API] Primary API returned active Baro with empty inventory, trying world state fallback...");
            try {
                const fallback = await fetchFromWorldState();
                if (fallback.inventory.length > 0) {
                    console.log(`[Baro API] World state fallback returned ${fallback.inventory.length} inventory items`);
                    return fallback;
                }
                console.warn("[Baro API] World state also returned empty inventory — using primary response");
            } catch (fallbackError) {
                console.warn("[Baro API] World state fallback failed, using primary response:", fallbackError);
            }
        }

        return data;
    } catch (primaryError) {
        console.error("[Baro API] Primary API failed:", primaryError);
        console.log("[Baro API] Attempting world state fallback...");

        try {
            const fallback = await fetchFromWorldState();
            console.log(`[Baro API] World state fallback succeeded (${fallback.inventory.length} items)`);
            return fallback;
        } catch (fallbackError) {
            console.error("[Baro API] World state fallback also failed:", fallbackError);
            const primaryMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
            const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            throw new Error(`Both Baro APIs failed — Primary: ${primaryMsg} | Fallback: ${fallbackMsg}`);
        }
    }
}

/**
 * Checks whether Baro Ki'Teer is currently active based on activation/expiry times.
 */
export function isBaroActive(activation: string, expiry: string, now: Date = new Date()): boolean {
    return now >= new Date(activation) && now <= new Date(expiry);
}
