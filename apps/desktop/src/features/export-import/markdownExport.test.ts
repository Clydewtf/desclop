import { describe, expect, it } from "vitest";
import { exportPlanMarkdown, exportProjectMarkdowns } from "./markdownExport";

describe("exportPlanMarkdown", () => {
  it("exports readable stages, tasks, checklist, and next steps", () => {
    const markdown = exportPlanMarkdown({
      projectName: "Desclop",
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
          description: "The storage boundary for the project.",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create store",
          description: "Keep the local data path inspectable.",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run tests",
          position: 0
        }
      ],
      checklistItems: [
        {
          id: "c1",
          taskId: "t1",
          title: "Add migration",
          description: "Apply it before repository tests.",
          completed: true,
          position: 0
        }
      ]
    });

    expect(markdown).toContain("# Desclop Plan");
    expect(markdown).toContain("## Foundation");
    expect(markdown).toContain("> The storage boundary for the project.");
    expect(markdown).toContain("- [ ] Create store");
    expect(markdown).toContain("  > Keep the local data path inspectable.");
    expect(markdown).toContain("  - [x] Add migration");
    expect(markdown).toContain("    > Apply it before repository tests.");
    expect(markdown).toContain("  - Next step: Run tests");
  });

  it("normalizes embedded line breaks so headings and list items stay readable", () => {
    const markdown = exportPlanMarkdown({
      projectName: "Desclop\nPortable",
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation\nSetup",
          description: "",
          position: 0,
          status: "current"
        }
      ],
      tasks: [
        {
          id: "t1",
          projectId: "p1",
          stageId: "s1",
          title: "Create\nstore",
          description: "",
          status: "active",
          priority: null,
          dueDate: null,
          nextStep: "Run\nall tests",
          position: 0
        }
      ],
      checklistItems: [
        {
          id: "c1",
          taskId: "t1",
          title: "Add\nmigration",
          completed: false,
          position: 0
        }
      ]
    });

    expect(markdown).toContain("# Desclop Portable Plan");
    expect(markdown).toContain("## Foundation Setup");
    expect(markdown).toContain("- [ ] Create store");
    expect(markdown).toContain("  - [ ] Add migration");
    expect(markdown).toContain("  - Next step: Run all tests");
    expect(markdown).not.toContain("Foundation\nSetup");
  });

  it("creates one separate export for each project plan", () => {
    const exports = exportProjectMarkdowns({
      projectName: "Desclop",
      plans: [
        { id: "plan-2", projectId: "p1", title: "Second plan", position: 1 },
        { id: "plan-1", projectId: "p1", title: "First plan", position: 0 }
      ],
      stages: [
        {
          id: "s1",
          projectId: "p1",
          planId: "plan-1",
          title: "First stage",
          description: "",
          position: 0,
          status: "current"
        },
        {
          id: "s2",
          projectId: "p1",
          planId: "plan-2",
          title: "Second stage",
          description: "",
          position: 0,
          status: "future"
        }
      ],
      tasks: [],
      checklistItems: []
    });

    expect(exports.map((item) => item.title)).toEqual(["First plan", "Second plan"]);
    expect(exports[0].markdown).toContain("# Desclop — First plan");
    expect(exports[0].markdown).toContain("## First stage");
    expect(exports[0].markdown).not.toContain("Second stage");
    expect(exports[1].markdown).toContain("## Second stage");
    expect(exports[1].markdown).not.toContain("First stage");
  });
});
