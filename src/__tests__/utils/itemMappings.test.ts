/**
 * Tests for itemMappings utility
 */
import { isIgnoredBaroItem, MANUAL_UNIQUE_NAME_MAP, IGNORED_BARO_ITEMS, WIKI_EXCLUDED_ITEMS, isWikiExcludedItem, PERMANENT_BARO_ITEMS, isPermanentBaroItem } from "../../utils/itemMappings";

describe("itemMappings", () => {
  describe("isIgnoredBaroItem", () => {
    it("returns true for 'Dragon Mod Pack' (case-insensitive)", () => {
      expect(isIgnoredBaroItem("Dragon Mod Pack")).toBe(true);
      expect(isIgnoredBaroItem("dragon mod pack")).toBe(true);
      expect(isIgnoredBaroItem("DRAGON MOD PACK")).toBe(true);
    });

    it("returns true for 'Falcon Mod Pack'", () => {
      expect(isIgnoredBaroItem("Falcon Mod Pack")).toBe(true);
    });

    it("returns false for normal items", () => {
      expect(isIgnoredBaroItem("Primed Flow")).toBe(false);
      expect(isIgnoredBaroItem("Prisma Grinlok")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isIgnoredBaroItem("")).toBe(false);
    });
  });

  describe("MANUAL_UNIQUE_NAME_MAP", () => {
    it("has a mapping for '3 day mod drop chance booster'", () => {
      expect(MANUAL_UNIQUE_NAME_MAP["3 day mod drop chance booster"]).toBeDefined();
    });

    it("has a mapping for \"ki'teer domestik drone\"", () => {
      expect(MANUAL_UNIQUE_NAME_MAP["ki'teer domestik drone"]).toContain("/Lotus/");
    });

    it("returns undefined for unknown keys", () => {
      expect(MANUAL_UNIQUE_NAME_MAP["nonexistent item"]).toBeUndefined();
    });
  });

  describe("IGNORED_BARO_ITEMS", () => {
    it("is an array of lowercase strings", () => {
      for (const item of IGNORED_BARO_ITEMS) {
        expect(item).toBe(item.toLowerCase());
      }
    });
  });

  describe("WIKI_EXCLUDED_ITEMS", () => {
    it("is an array of strings", () => {
      expect(Array.isArray(WIKI_EXCLUDED_ITEMS)).toBe(true);
      expect(WIKI_EXCLUDED_ITEMS.length).toBeGreaterThan(0);
    });

    it("contains 'falcon mod pack' (lowercase)", () => {
      expect(WIKI_EXCLUDED_ITEMS).toContain("falcon mod pack");
    });

    it("contains 'dragon mod pack' (lowercase)", () => {
      expect(WIKI_EXCLUDED_ITEMS).toContain("dragon mod pack");
    });
  });

  describe("isWikiExcludedItem", () => {
    it("returns true for 'Falcon Mod Pack'", () => {
      expect(isWikiExcludedItem("Falcon Mod Pack")).toBe(true);
    });

    it("returns true for 'Dragon Mod Pack'", () => {
      expect(isWikiExcludedItem("Dragon Mod Pack")).toBe(true);
    });

    it("returns false for normal items", () => {
      expect(isWikiExcludedItem("Primed Flow")).toBe(false);
      expect(isWikiExcludedItem("Prisma Grinlok")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isWikiExcludedItem("")).toBe(false);
    });
  });

  describe("PERMANENT_BARO_ITEMS", () => {
    it("is an array of strings", () => {
      expect(Array.isArray(PERMANENT_BARO_ITEMS)).toBe(true);
    });

    it("contains 'void surplus'", () => {
      expect(PERMANENT_BARO_ITEMS).toContain("void surplus");
    });
  });

  describe("isPermanentBaroItem", () => {
    it("returns true for 'Void Surplus' (case-insensitive)", () => {
      expect(isPermanentBaroItem("Void Surplus")).toBe(true);
      expect(isPermanentBaroItem("void surplus")).toBe(true);
      expect(isPermanentBaroItem("VOID SURPLUS")).toBe(true);
    });

    it("returns false for normal items", () => {
      expect(isPermanentBaroItem("Primed Flow")).toBe(false);
      expect(isPermanentBaroItem("Dragon Mod Pack")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isPermanentBaroItem("")).toBe(false);
    });
  });
});
