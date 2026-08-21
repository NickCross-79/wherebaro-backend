/**
 * Shared Baro Ki'Teer API service.
 * Centralizes all interactions with the Warframestat Baro API,
 * with an automatic fallback to the raw Warframe world state
 * when the primary API is unreliable.
 */
import { fetchWorldStateTrader } from "./worldStateService";

const BARO_API_URL = "https://api.warframestat.us/pc/voidTraders/?language=en";

// Set WARFRAMESTAT_DISABLED=true in app settings to bypass the primary API temporarily
const WARFRAMESTAT_DISABLED = process.env.WARFRAMESTAT_DISABLED === "true";

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
 * Detects the special TennoCon relay trader that appears in the voidTraders
 * feed during TennoCon weekend — the app only ever shows the regular Baro.
 */
function isTennoConTrader(trader: BaroApiResponse): boolean {
    return /tennocon/i.test(`${trader.id ?? ""} ${trader.location ?? ""}`);
}

/**
 * Fetches Baro data from the primary Warframestat API.
 */
async function fetchFromWarframestat(): Promise<BaroApiResponse> {
    const response = await fetch(BARO_API_URL, {
        headers: {
            "Accept": "application/json",
            "User-Agent": "WhenBaro/1.1",
        },
    });
    if (!response.ok) {
        throw new Error(`Warframestat API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // During TennoCon the API returns an extra trader at the TennoCon relay
    // (e.g. "TennoConHUB2"), often first — only the regular Baro counts.
    const traders: (BaroApiResponse | undefined)[] = Array.isArray(data) ? data : [data];
    const baroData = traders.find((trader) => trader && !isTennoConTrader(trader));
    if (!baroData) {
        throw new Error("No regular Baro trader found in Warframestat API response");
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
export async function fetchFromWorldState(): Promise<BaroApiResponse> {
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
 * - Reports Baro as absent while still serving an already-expired cycle
 */
export async function fetchBaroData(): Promise<BaroApiResponse> {
    if (WARFRAMESTAT_DISABLED) {
        console.warn("[Baro API] Warframestat API temporarily disabled — using world state directly.");
        return fetchFromWorldState();
    }

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
        } else if (!active && isStaleCycle(data.expiry)) {
            // The primary is serving a cycle that already expired, which means it has
            // not published the new one yet — the usual state right at an arrival
            // boundary. Reporting "not active" here is what silently skipped a whole
            // arrival: the world state flips exactly on time, so ask it directly
            // rather than trusting a stale "absent".
            console.warn(`[Baro API] Primary API returned an already-expired cycle (expiry: ${data.expiry}), cross-checking world state...`);
            try {
                const fallback = await fetchFromWorldState();
                if (!isStaleCycle(fallback.expiry)) {
                    console.log(
                        `[Baro API] World state has a newer cycle (activation: ${fallback.activation}, ` +
                        `active: ${isBaroActive(fallback.activation, fallback.expiry)}, ${fallback.inventory.length} items) — using it`
                    );
                    return fallback;
                }
                console.warn("[Baro API] World state is serving the same expired cycle — using primary response");
            } catch (fallbackError) {
                console.warn("[Baro API] World state cross-check failed, using primary response:", fallbackError);
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

/**
 * Checks whether a response describes a cycle that has already ended.
 *
 * This distinguishes the two very different reasons an API reports Baro as
 * absent:
 *   - expiry in the future  → a genuine gap between visits; the next cycle is
 *                             already published and "absent" is the truth.
 *   - expiry in the past    → the source is lagging and still serving the last
 *                             visit, so "absent" cannot be trusted.
 */
export function isStaleCycle(expiry: string, now: Date = new Date()): boolean {
    return new Date(expiry) <= now;
}
