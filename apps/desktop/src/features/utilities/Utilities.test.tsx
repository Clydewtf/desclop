import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Utilities } from "./Utilities";

function renderUtilities(overrides: Partial<Parameters<typeof Utilities>[0]> = {}) {
  return renderWithRouter(
    <Utilities
      projectPath="/tmp/desclop"
      gitEnabled={true}
      gitHealth="Git unavailable."
      markdownExport={"# Desclop\n\n## Foundation"}
      bundleDestination=""
      bundleFolder="/tmp/desclop-bundle"
      reselectedLocalPath=""
      portableStatus={null}
      portableError={null}
      onOpenImport={vi.fn()}
      onChooseBundleDestination={vi.fn()}
      onChooseBundleFolder={vi.fn()}
      onChooseLocalProjectFolder={vi.fn()}
      onExportPortableBundle={vi.fn()}
      onImportPortableBundle={vi.fn()}
      {...overrides}
    />
  );
}

describe("Utilities", () => {
  it("explains markdown export and shows a readonly preview", () => {
    renderUtilities();

    expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Markdown export" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Readable Markdown for copying, sharing, or archiving the current plan."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown preview")).toHaveValue(
      "# Desclop\n\n## Foundation"
    );
    expect(screen.getByLabelText("Markdown preview")).toHaveAttribute("readonly");
  });

  it("uses choose folder controls for portable export and import", async () => {
    const user = userEvent.setup();
    const onChooseBundleDestination = vi.fn();
    const onChooseBundleFolder = vi.fn();
    const onChooseLocalProjectFolder = vi.fn();

    renderUtilities({
      bundleDestination: "/tmp/backups",
      reselectedLocalPath: "/tmp/desclop",
      onChooseBundleDestination,
      onChooseBundleFolder,
      onChooseLocalProjectFolder
    });

    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));

    expect(onChooseBundleDestination).toHaveBeenCalledTimes(1);
    expect(onChooseBundleFolder).toHaveBeenCalledTimes(1);
    expect(onChooseLocalProjectFolder).toHaveBeenCalledTimes(1);
  });

  it("keeps portable actions disabled until required folders are selected", () => {
    renderUtilities({
      bundleDestination: "",
      bundleFolder: "/tmp/backup",
      reselectedLocalPath: ""
    });

    expect(screen.getByRole("button", { name: "Export portable backup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import portable backup" })).toBeDisabled();
  });

  it("submits portable actions when folder selections are valid", async () => {
    const user = userEvent.setup();
    const onExportPortableBundle = vi.fn();
    const onImportPortableBundle = vi.fn();

    renderUtilities({
      bundleDestination: "/tmp/backups",
      bundleFolder: "/tmp/backup",
      reselectedLocalPath: "/tmp/desclop",
      onExportPortableBundle,
      onImportPortableBundle
    });

    await user.click(screen.getByRole("button", { name: "Export portable backup" }));
    await user.click(screen.getByRole("button", { name: "Import portable backup" }));

    expect(onExportPortableBundle).toHaveBeenCalledTimes(1);
    expect(onImportPortableBundle).toHaveBeenCalledTimes(1);
  });
});
