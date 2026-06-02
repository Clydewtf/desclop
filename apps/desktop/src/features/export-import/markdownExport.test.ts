import { describe, expect, it } from "vitest";
import { exportPlanMarkdown } from "./markdownExport";

describe("exportPlanMarkdown", () => {
  it("exports readable stages, tasks, checklist, and next steps", () => {
    const markdown = exportPlanMarkdown({
      projectName: "Desclop",
      stages: [
        {
          id: "s1",
          projectId: "p1",
          title: "Foundation",
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
          title: "Create store",
          description: "",
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
          completed: true,
          position: 0
        }
      ]
    });

    expect(markdown).toContain("# Desclop Plan");
    expect(markdown).toContain("## Foundation");
    expect(markdown).toContain("- [ ] Create store");
    expect(markdown).toContain("  - [x] Add migration");
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
});
