import { describe, expect, it } from "vitest";
import {
  PLANNER_ARCHIVE_STORAGE_KEY,
  readArchivedPlanIds,
  writeArchivedPlanIds,
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

describe("planner archive persistence", () => {
  it("stores archive ids per project and restores them without affecting another project", () => {
    const { storage } = storageFixture();

    expect(writeArchivedPlanIds(storage, "project-1", ["plan-1", "plan-1"])).toBe(true);
    expect(writeArchivedPlanIds(storage, "project-2", ["plan-2"])).toBe(true);
    expect(readArchivedPlanIds(storage, "project-1")).toEqual(["plan-1"]);
    expect(readArchivedPlanIds(storage, "project-2")).toEqual(["plan-2"]);
  });

  it("removes a restored plan id while preserving the stored record", () => {
    const { storage, values } = storageFixture();

    writeArchivedPlanIds(storage, "project-1", ["plan-1", "plan-2"]);
    expect(writeArchivedPlanIds(storage, "project-1", ["plan-2"])).toBe(true);

    expect(readArchivedPlanIds(storage, "project-1")).toEqual(["plan-2"]);
    expect(values.has(PLANNER_ARCHIVE_STORAGE_KEY)).toBe(true);
  });

  it("treats malformed local state as empty instead of blocking the plan", () => {
    const { storage } = storageFixture({ [PLANNER_ARCHIVE_STORAGE_KEY]: "not-json" });

    expect(readArchivedPlanIds(storage, "project-1")).toEqual([]);
  });
});
