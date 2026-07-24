import { describe, expect, it } from "vitest";
import {
  LAST_PROJECT_STORAGE_KEY,
  readLastProjectId,
  writeLastProjectId
} from "./projectSelection";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values
  };
}

describe("project selection persistence", () => {
  it("writes and reads the last opened project", () => {
    const storage = createStorage();

    expect(writeLastProjectId(storage, " project-2 ")).toBe(true);
    expect(storage.values.get(LAST_PROJECT_STORAGE_KEY)).toBe("project-2");
    expect(readLastProjectId(storage)).toBe("project-2");
  });

  it("accepts legacy JSON values and ignores malformed values", () => {
    expect(
      readLastProjectId(
        createStorage({
          [LAST_PROJECT_STORAGE_KEY]: JSON.stringify({ projectId: "project-legacy" })
        })
      )
    ).toBe("project-legacy");
    expect(
      readLastProjectId(createStorage({ [LAST_PROJECT_STORAGE_KEY]: "   " }))
    ).toBeNull();
    expect(writeLastProjectId(createStorage(), " ")).toBe(false);
  });
});
