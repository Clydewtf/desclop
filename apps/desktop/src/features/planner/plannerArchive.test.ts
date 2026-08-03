import { describe, expect, it } from "vitest";
import {
  hasLegacyPlanArchiveRecord,
  hasMigratedLegacyPlanArchives,
  markLegacyPlanArchivesMigrated,
  PLANNER_ARCHIVE_STORAGE_KEY,
  PLANNER_ARCHIVE_MIGRATION_STORAGE_KEY,
  readLegacyArchivedPlanIds,
  type PlannerArchiveStorage
} from "./plannerArchive";

function storageFixture(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: PlannerArchiveStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  return { storage, values };
}

describe("legacy planner archive migration", () => {
  it("reads old archive ids per project without making them the new source of truth", () => {
    const { storage } = storageFixture();

    expect(hasLegacyPlanArchiveRecord(storage)).toBe(false);

    storage.setItem(
      PLANNER_ARCHIVE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        projects: { "project-1": ["plan-1", "plan-1"], "project-2": ["plan-2"] }
      })
    );

    expect(hasLegacyPlanArchiveRecord(storage)).toBe(true);
    expect(readLegacyArchivedPlanIds(storage, "project-1")).toEqual(["plan-1"]);
    expect(readLegacyArchivedPlanIds(storage, "project-2")).toEqual(["plan-2"]);
  });

  it("records each successful local migration once", () => {
    const { storage, values } = storageFixture();

    expect(hasMigratedLegacyPlanArchives(storage, "project-1")).toBe(false);
    expect(markLegacyPlanArchivesMigrated(storage, "project-1")).toBe(true);
    expect(markLegacyPlanArchivesMigrated(storage, "project-1")).toBe(true);
    expect(hasMigratedLegacyPlanArchives(storage, "project-1")).toBe(true);
    expect(hasMigratedLegacyPlanArchives(storage, "project-2")).toBe(false);
    expect(values.has(PLANNER_ARCHIVE_MIGRATION_STORAGE_KEY)).toBe(true);
  });

  it("treats malformed local state as empty instead of blocking the plan", () => {
    const { storage } = storageFixture({ [PLANNER_ARCHIVE_STORAGE_KEY]: "not-json" });

    expect(readLegacyArchivedPlanIds(storage, "project-1")).toEqual([]);
  });
});
