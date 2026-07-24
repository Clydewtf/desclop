import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { MarkdownImportPreview } from "./MarkdownImportPreview";

describe("MarkdownImportPreview", () => {
  it("shows guidance before the first preview", () => {
    renderWithRouter(<MarkdownImportPreview parsed={null} onImport={() => undefined} />);

    expect(screen.getByRole("heading", { name: "Import preview" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to preview yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter or paste a Markdown plan above, then click Preview import/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import .* task/ })).not.toBeInTheDocument();
  });

  it("shows parsed stages, tasks, checklist counts, and warnings", () => {
    renderWithRouter(
      <MarkdownImportPreview
        parsed={{
          planTitle: "Build MVP",
          stages: [
            {
              title: "Foundation",
              description: "",
              position: 0,
              tasks: [
                {
                  title: "Create local store",
                  description: "The local database is the source of truth.",
                  status: "todo",
                  position: 0,
                  checklist: [
                    {
                      title: "Add migration",
                      description: "Keep migrations repeatable.",
                      completed: false,
                      position: 0
                    }
                  ]
                }
              ]
            }
          ],
          warnings: ["Line 1: task checkbox appears before any stage heading and was not imported."]
        }}
        onImport={() => undefined}
      />
    );

    expect(screen.getByText("Foundation")).toBeInTheDocument();
    expect(screen.getByText("Build MVP")).toBeInTheDocument();
    expect(screen.getByText("1 stage")).toBeInTheDocument();
    expect(screen.getByText("1 task")).toBeInTheDocument();
    expect(screen.getAllByText("1 checklist item")).toHaveLength(2);
    expect(screen.getByText("Create local store")).toBeInTheDocument();
    expect(screen.getByText("The local database is the source of truth.")).toBeInTheDocument();
    expect(screen.getByText(/Line 1:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 task" })).toBeEnabled();
  });

  it("shows the fallback plan title and blocks a preview without tasks", () => {
    renderWithRouter(
      <MarkdownImportPreview
        parsed={{
          planTitle: null,
          stages: [
            { title: "Empty stage", description: "Context", position: 0, tasks: [] }
          ],
          warnings: []
        }}
        fallbackPlanTitle="Plan 2"
        onImport={() => undefined}
      />
    );

    expect(screen.getByText("Plan 2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("A plan without tasks cannot be created.");
    expect(screen.getByRole("button", { name: "Import 0 tasks" })).toBeDisabled();
  });
});
