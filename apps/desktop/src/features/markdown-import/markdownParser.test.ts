import { describe, expect, it } from "vitest";
import {
  canImportParsedPlan,
  parsedChecklistCount,
  parsedTaskCount,
  parseMarkdownPlan
} from "./markdownParser";

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
      { title: "Add migration", description: "", completed: false, position: 0 },
      { title: "Add domain types", description: "", completed: true, position: 1 }
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

  it("imports only explicitly positioned descriptions for stages, tasks, and checklist items", () => {
    const result = parseMarkdownPlan(
      [
        "# Build MVP",
        "## Foundation",
        "> Local-first storage and migration context",
        "- [ ] Create local store",
        "  > Keep the data path easy to inspect",
        "  - [ ] Add migration",
        "    > Apply it before repository tests",
        "### Resume flow",
        "- [x] Show Today screen"
      ].join("\n")
    );

    expect(result.warnings).toEqual([]);
    expect(result.stages).toMatchObject([
      {
        title: "Foundation",
        description: "Local-first storage and migration context",
        tasks: [
          {
            title: "Create local store",
            description: "Keep the data path easy to inspect",
            checklist: [
              {
                title: "Add migration",
                description: "Apply it before repository tests"
              }
            ]
          }
        ]
      },
      { title: "Resume flow", description: "" }
    ]);
  });

  it("warns for unsupported content and invalid indentation without losing parsed tasks", () => {
    const result = parseMarkdownPlan(
      [
        "## Foundation",
        "A prose line that is not a description",
        "- [ ] Create local store",
        "    - [ ] Four-space nesting is not supported",
        "- ordinary bullet"
      ].join("\n")
    );

    expect(result.stages[0].tasks).toHaveLength(1);
    expect(result.stages[0].tasks[0].checklist).toEqual([]);
    expect(result.warnings).toEqual([
      "Line 2: this Markdown line is not part of the supported plan syntax and was not imported.",
      "Line 4: checkbox indentation must be zero spaces for a task or exactly two spaces for a checklist item; this line was not imported.",
      "Line 5: this Markdown line is not part of the supported plan syntax and was not imported."
    ]);
  });

  it("requires descriptions to directly follow their entity", () => {
    const result = parseMarkdownPlan(
      ["## Foundation", "- [ ] Create local store", "", "  > Too late"].join("\n")
    );

    expect(result.stages[0].tasks[0].description).toBe("");
    expect(result.warnings).toEqual([
      "Line 4: task descriptions must follow a top-level task and were not imported."
    ]);
  });

  it("validates the importable task boundary and counts parsed entities", () => {
    const empty = parseMarkdownPlan("## Empty stage");
    const populated = parseMarkdownPlan(
      ["## Foundation", "- [ ] Create local store", "  - [ ] Add migration"].join("\n")
    );

    expect(canImportParsedPlan(empty)).toBe(false);
    expect(canImportParsedPlan(populated)).toBe(true);
    expect(parsedTaskCount(populated)).toBe(1);
    expect(parsedChecklistCount(populated)).toBe(1);
  });
});
