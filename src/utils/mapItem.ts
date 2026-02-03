import Item from "../models/Item";

export interface RawBaroItemData {
    Name: string;
    Image: string;
    Link: string;
    CreditCost: number;
    DucatCost: number;
    Type: string;
    OfferingDates: string[];
    PcOfferingDates?: string[];
    ConsoleOfferingDates?: string[];
}

/**
 * Maps raw Baro Ki'Teer item data to Item model
 * Combines all platform offering dates into a single sorted array
 */
export function mapRawItemToBaroItem(rawData: any): Item {
    const offeringDates = Array.isArray(rawData?.OfferingDates) ? rawData.OfferingDates : [];
    const pcOfferingDates = Array.isArray(rawData?.PcOfferingDates) ? rawData.PcOfferingDates : [];
    const combinedOfferingDates = Array.from(
        new Set([...offeringDates, ...pcOfferingDates])
    ).sort();

    return new Item(
        rawData.Name,
        rawData.Image,
        rawData.Link,
        rawData.CreditCost,
        rawData.DucatCost,
        rawData.Type,
        combinedOfferingDates,
        [], // Initial empty likes array
        []  // Initial empty reviews array
    );
}

/**
 * Maps a collection of raw items (from JSON data)
 * @param rawItems Object with item names as keys and item data as values
 */
export function mapRawItemsCollection(rawItems: Record<string, RawBaroItemData>): Item[] {
    return Object.entries(rawItems).map(([_, itemData]) => 
        mapRawItemToBaroItem(itemData)
    );
}
