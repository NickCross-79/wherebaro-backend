/**
 * Tests for itemMappings utility
 */
import { isIgnoredBaroItem, MANUAL_UNIQUE_NAME_MAP, IGNORED_BARO_ITEMS } from "../../utils/itemMappings";

describe("itemMappings", () => {
  describe("isIgnoredBaroItem", () => {
    it("returns true for 'Void Surplus' (case-insensitive)", () => {
      expect(isIgnoredBaroItem("Void Surplus")).toBe(true);
      expect(isIgnoredBaroItem("void surplus")).toBe(true);
      expect(isIgnoredBaroItem("VOID SURPLUS")).toBe(true);
    });

    it("returns true for 'Dragon Mod Pack'", () => {
      expect(isIgnoredBaroItem("Dragon Mod Pack")).toBe(true);
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
});
