import BaroItem from "../models/baroItem.js";

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
 * Maps raw Baro Ki'Teer item data to BaroItem model
 * Combines all platform offering dates into a single sorted array
 */
export function mapRawItemToBaroItem(rawData: any): BaroItem {

    return new BaroItem(
        rawData.Name,
        rawData.Image,
        rawData.Link,
        rawData.CreditCost,
        rawData.DucatCost,
        rawData.Type,
        rawData.OfferingDates,
        0, // Initial likes count
        []  // Initial empty reviews array
    );
}

/**
 * Maps a collection of raw items (from JSON data)
 * @param rawItems Object with item names as keys and item data as values
 */
export function mapRawItemsCollection(rawItems: Record<string, RawBaroItemData>): BaroItem[] {
    return Object.entries(rawItems).map(([_, itemData]) => 
        mapRawItemToBaroItem(itemData)
    );
}
