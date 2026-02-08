/**
 * Shared Baro Ki'Teer API service.
 * Centralizes all interactions with the Warframestat Baro API.
 */

const BARO_API_URL = "https://api.warframestat.us/pc/voidTrader/";

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
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Fetches Baro data from the Warframestat API.
 * Always returns a valid response — inventory defaults to [] when Baro is absent.
 */
export async function fetchBaroData(): Promise<BaroApiResponse> {
    const response = await fetch(BARO_API_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch Baro data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const baroData: BaroApiResponse | undefined = Array.isArray(data) ? data[0] : data;
    if (!baroData) {
        throw new Error("Invalid Baro data received from API");
    }

    baroData.inventory ??= [];
    return baroData;
}

/**
 * Checks whether Baro Ki'Teer is currently active based on activation/expiry times.
 */
export function isBaroActive(activation: string, expiry: string, now: Date = new Date()): boolean {
    return now >= new Date(activation) && now <= new Date(expiry);
}
