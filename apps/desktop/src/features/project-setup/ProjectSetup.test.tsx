import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { ProjectSetup } from "./ProjectSetup";

describe("ProjectSetup", () => {
  it("shows a no-project empty state while keeping setup fields available", () => {
    renderWithRouter(<ProjectSetup onCreate={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Create a local project", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No project setup", level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
    expect(screen.getByLabelText("Local folder path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create project" })).toBeEnabled();
  });

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

  it("selects a folder, displays the path, and shows Git as an optional hint", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onChooseFolder = vi.fn().mockResolvedValue("/tmp/selected-project");
    const onValidateFolder = vi.fn().mockResolvedValue({ gitRepository: true });

    renderWithRouter(
      <ProjectSetup
        onCreate={onCreate}
        onChooseFolder={onChooseFolder}
        onValidateFolder={onValidateFolder}
      />
    );

    await user.click(screen.getByRole("button", { name: "Choose folder" }));

    expect(onChooseFolder).toHaveBeenCalledTimes(1);
    expect(onValidateFolder).toHaveBeenCalledWith("/tmp/selected-project");
    expect(screen.getByLabelText("Local folder path")).toHaveValue("/tmp/selected-project");
    expect(screen.getByText("/tmp/selected-project")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Git repository detected. Connecting Git is optional."
    );
    expect(screen.getByRole("checkbox", { name: "Connect local Git repository" })).not.toBeChecked();

    await user.type(screen.getByLabelText("Project name"), "Selected project");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Selected project",
      localPath: "/tmp/selected-project",
      gitEnabled: false
    });
  });

  it("keeps a manually entered path as the fallback and explains validation errors", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onValidateFolder = vi
      .fn()
      .mockRejectedValue(new Error("The selected folder does not exist."));

    renderWithRouter(<ProjectSetup onCreate={onCreate} onValidateFolder={onValidateFolder} />);

    await user.type(screen.getByLabelText("Project name"), "Missing folder");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/missing-project");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onValidateFolder).toHaveBeenCalledWith("/tmp/missing-project");
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText("The selected folder does not exist.")).toBeInTheDocument();
  });

  it("does not replace a manually entered path when the picker is cancelled", async () => {
    const user = userEvent.setup();
    const onChooseFolder = vi.fn().mockResolvedValue(null);

    renderWithRouter(<ProjectSetup onCreate={vi.fn()} onChooseFolder={onChooseFolder} />);

    await user.type(screen.getByLabelText("Local folder path"), "/tmp/manual-project");
    await user.click(screen.getByRole("button", { name: "Choose folder" }));

    expect(screen.getByLabelText("Local folder path")).toHaveValue("/tmp/manual-project");
  });

  it("keeps Git optional", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onValidateFolder = vi.fn().mockResolvedValue({ gitRepository: false });

    renderWithRouter(<ProjectSetup onCreate={onCreate} onValidateFolder={onValidateFolder} />);

    await user.type(screen.getByLabelText("Project name"), "No Git Project");
    await user.type(screen.getByLabelText("Local folder path"), "/tmp/no-git");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "No Git Project",
      localPath: "/tmp/no-git",
      gitEnabled: false
    });
    expect(onValidateFolder).toHaveBeenCalledWith("/tmp/no-git");
  });

  it("blocks whitespace-only values", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    renderWithRouter(<ProjectSetup onCreate={onCreate} />);

    await user.type(screen.getByLabelText("Project name"), "   ");
    await user.type(screen.getByLabelText("Local folder path"), "   ");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Project name is required.")).toBeInTheDocument();
    expect(screen.getByText("Local folder path is required.")).toBeInTheDocument();
  });

  it("disables submit while creating and shows creation errors", () => {
    renderWithRouter(
      <ProjectSetup
        creating
        error="Unable to create project."
        onCreate={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Creating project" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to create project.");
  });
});
