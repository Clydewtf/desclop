import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { MarkdownImportPreview } from "./MarkdownImportPreview";

describe("MarkdownImportPreview", () => {
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
                  status: "todo",
                  position: 0,
                  checklist: [
                    { title: "Add migration", completed: false, position: 0 }
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
    expect(screen.getByText("Create local store")).toBeInTheDocument();
    expect(screen.getByText("1 checklist item")).toBeInTheDocument();
    expect(screen.getByText(/Line 1:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import plan" })).toBeEnabled();
  });
});
