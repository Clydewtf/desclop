import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { ProjectSetup } from "./ProjectSetup";

describe("ProjectSetup", () => {
  it("creates a project with a local folder path", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    renderWithRouter(<ProjectSetup onCreate={onCreate} />);

    await user.type(screen.getByLabelText("Project name"), "Desclop");
    await user.type(screen.getByLabelText("Local folder path"), "/Users/clyde/projects/desclop");
    await user.click(screen.getByRole("checkbox", { name: "Connect local Git repository" }));
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Desclop",
      localPath: "/Users/clyde/projects/desclop",
      gitEnabled: true
    });
  });

  it("keeps Git optional", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    renderWithRouter(<ProjectSetup onCreate={onCreate} />);

    await user.type(screen.getByLabelText("Project name"), "No Git Project");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/no-git");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "No Git Project",
      localPath: "/tmp/no-git",
      gitEnabled: false
    });
  });
});
