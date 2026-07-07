import { describe, expect, it } from "vitest";
import { parseMarkdownPlan } from "./markdownParser";

describe("parseMarkdownPlan", () => {
  it("maps headings to stages, top-level checkboxes to tasks, and nested checkboxes to checklist items", () => {
    const markdown = [
      "# Build MVP",
      "## Foundation",
      "- [ ] Create local store",
      "  - [ ] Add migration",
      "  - [x] Add domain types",
      "## Resume Flow",
      "- [x] Show Today screen"
    ].join("\n");

    const result = parseMarkdownPlan(markdown);

    expect(result.planTitle).toBe("Build MVP");
    expect(result.warnings).toEqual([]);
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0]).toMatchObject({ title: "Foundation", position: 0 });
    expect(result.stages[0].tasks[0]).toMatchObject({
      title: "Create local store",
      status: "todo",
      position: 0
    });
    expect(result.stages[0].tasks[0].checklist).toEqual([
      { title: "Add migration", completed: false, position: 0 },
      { title: "Add domain types", completed: true, position: 1 }
    ]);
    expect(result.stages[1].tasks[0]).toMatchObject({
      title: "Show Today screen",
      status: "done"
    });
  });

  it("warns when a task appears before a stage", () => {
    const result = parseMarkdownPlan("- [ ] Floating task");

    expect(result.planTitle).toBeNull();
    expect(result.stages).toEqual([]);
    expect(result.warnings).toEqual([
      "Line 1: task checkbox appears before any stage heading and was not imported."
    ]);
  });
});
