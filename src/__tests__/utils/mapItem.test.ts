/**
 * Tests for mapItem utility
 */
import { mapRawItemToBaroItem } from "../../utils/mapItem";
import Item from "../../models/Item";

describe("mapItem", () => {
  // ── mapRawItemToBaroItem ───────────────────────────────────────────────────

  describe("mapRawItemToBaroItem", () => {
    it("maps a complete raw item to an Item", () => {
      const raw = {
        Name: "Primed Flow",
        Image: "https://example.com/img.png",
        Link: "https://wiki.warframe.com/Primed_Flow",
        CreditCost: 175000,
        DucatCost: 300,
        Type: "Mod",
        OfferingDates: ["2024-01-10"],
        PcOfferingDates: ["2024-03-15"],
      };

      const item = mapRawItemToBaroItem(raw);

      expect(item).toBeInstanceOf(Item);
      expect(item.name).toBe("Primed Flow");
      expect(item.image).toBe("https://example.com/img.png");
      expect(item.link).toBe("https://wiki.warframe.com/Primed_Flow");
      expect(item.creditPrice).toBe(175000);
      expect(item.ducatPrice).toBe(300);
      expect(item.type).toBe("Mod");
      expect(item.likes).toEqual([]);
      expect(item.reviews).toEqual([]);
    });

    it("combines and deduplicates OfferingDates + PcOfferingDates", () => {
      const raw = {
        Name: "Test",
        Image: "",
        Link: "",
        CreditCost: 0,
        DucatCost: 0,
        Type: "Misc",
        OfferingDates: ["2024-01-10", "2024-03-15"],
        PcOfferingDates: ["2024-03-15", "2024-06-01"],
      };

      const item = mapRawItemToBaroItem(raw);
      expect(item.offeringDates).toEqual(["2024-01-10", "2024-03-15", "2024-06-01"]);
    });

    it("sorts combined dates", () => {
      const raw = {
        Name: "Test",
        Image: "",
        Link: "",
        CreditCost: 0,
        DucatCost: 0,
        Type: "Misc",
        OfferingDates: ["2024-06-01"],
        PcOfferingDates: ["2024-01-10"],
      };

      const item = mapRawItemToBaroItem(raw);
      expect(item.offeringDates).toEqual(["2024-01-10", "2024-06-01"]);
    });

    it("handles missing OfferingDates gracefully", () => {
      const raw = {
        Name: "Test",
        Image: "",
        Link: "",
        CreditCost: 0,
        DucatCost: 0,
        Type: "Misc",
      };

      const item = mapRawItemToBaroItem(raw);
      expect(item.offeringDates).toEqual([]);
    });

    it("handles null/undefined rawData fields", () => {
      const item = mapRawItemToBaroItem({});
      expect(item).toBeInstanceOf(Item);
      expect(item.name).toBeUndefined();
      expect(item.offeringDates).toEqual([]);
    });
  });
});
