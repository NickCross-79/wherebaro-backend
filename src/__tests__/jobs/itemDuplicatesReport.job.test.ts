/**
 * Tests for itemDuplicatesReport.job — read-only duplicate detection.
 */
import { ObjectId } from "mongodb";
import { itemDuplicatesReportJob } from "../../jobs/itemDuplicatesReport.job";

const mockCollections: any = {};
jest.mock("../../db/database.service", () => ({
  connectToDatabase: jest.fn().mockResolvedValue(undefined),
  get collections() {
    return mockCollections;
  },
}));

function mockItems(docs: any[]) {
  const col = {
    find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(docs) }),
    updateOne: jest.fn(),
    insertOne: jest.fn(),
    deleteOne: jest.fn(),
  };
  mockCollections.items = col;
  return col;
}

const doc = (overrides: any = {}) => ({
  _id: new ObjectId(),
  name: "Primed Flow",
  uniqueName: "/Lotus/Upgrades/Mods/Primed/Flow",
  offeringDates: ["2024-01-05", "2025-06-13"],
  likes: [],
  reviews: [],
  ...overrides,
});

describe("itemDuplicatesReport.job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockCollections.items;
  });

  it("reports nothing when every item is distinct", async () => {
    mockItems([doc(), doc({ name: "Primed Vigor", uniqueName: "/Lotus/Upgrades/Mods/Primed/Vigor" })]);

    const result = await itemDuplicatesReportJob();

    expect(result).toMatchObject({ totalItems: 2, duplicateGroups: 0, groupsShowingFalseNew: 0 });
  });

  it("catches the case-difference duplicate and flags the false NEW", async () => {
    // Exactly the Crewsuit shape: original from the wiki, duplicate inserted today
    const original = doc({
      name: "Masker's Theodolite CrewSuit",
      uniqueName: "/Lotus/Types/X",
      offeringDates: ["2024-03-01", "2025-02-14"],
      likes: [{ user: "a" }],
    });
    const duplicate = doc({
      name: "Masker's Theodolite Crewsuit",
      uniqueName: "/Lotus/Types/Y",
      offeringDates: ["2026-08-21"],
    });
    mockItems([original, duplicate]);

    const result = await itemDuplicatesReportJob();

    expect(result.duplicateGroups).toBe(1);
    expect(result.groupsShowingFalseNew).toBe(1);

    const group = result.groups[0];
    expect(group.groupedBy).toBe("name");
    expect(group.entries).toHaveLength(2);

    const flagged = group.entries.filter((e) => e.showsAsNew);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].name).toBe("Masker's Theodolite Crewsuit");
    expect(flagged[0].offeringCount).toBe(1);

    // The surviving history and engagement live on the original
    const kept = group.entries.find((e) => !e.showsAsNew)!;
    expect(kept.offeringCount).toBe(2);
    expect(kept.likes).toBe(1);
  });

  it("catches duplicates that differ only by the StoreItems prefix", async () => {
    const a = doc({ name: "Some Deco", uniqueName: "/Lotus/Types/Items/ShipDecos/Thing" });
    const b = doc({
      name: "Some Deco Renamed",
      uniqueName: "/Lotus/StoreItems/Types/Items/ShipDecos/Thing",
      offeringDates: ["2026-08-21"],
    });
    mockItems([a, b]);

    const result = await itemDuplicatesReportJob();

    expect(result.duplicateGroups).toBe(1);
    expect(result.groups[0].groupedBy).toBe("uniqueName");
    expect(result.groups[0].entries).toHaveLength(2);
  });

  it("does not report the same pair twice under both groupings", async () => {
    const a = doc({ name: "Thing", uniqueName: "/Lotus/Types/Thing" });
    const b = doc({ name: "thing", uniqueName: "/Lotus/StoreItems/Types/Thing", offeringDates: ["2026-08-21"] });
    mockItems([a, b]);

    const result = await itemDuplicatesReportJob();

    expect(result.duplicateGroups).toBe(1);
  });

  it("writes nothing", async () => {
    const col = mockItems([
      doc({ name: "A", uniqueName: "/Lotus/A" }),
      doc({ name: "a", uniqueName: "/Lotus/A2", offeringDates: ["2026-08-21"] }),
    ]);

    await itemDuplicatesReportJob();

    expect(col.updateOne).not.toHaveBeenCalled();
    expect(col.insertOne).not.toHaveBeenCalled();
    expect(col.deleteOne).not.toHaveBeenCalled();
  });
});
