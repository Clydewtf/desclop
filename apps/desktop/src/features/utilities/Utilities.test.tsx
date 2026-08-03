import { screen, within } from "@testing-library/react";
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
      markdownExports={[
        {
          id: "plan-1",
          title: "Foundation plan",
          markdown: "# Desclop — Foundation plan\n\n## Foundation"
        }
      ]}
      bundleDestination=""
      bundleFolder="/tmp/desclop-bundle"
      reselectedLocalPath=""
      portableStatus={null}
      portableError={null}
      restorePreview={null}
      diagnostics={null}
      diagnosticsLoading={false}
      diagnosticsError={null}
      relinkPath=""
      onOpenImport={vi.fn()}
      onChooseBundleDestination={vi.fn()}
      onChooseBundleFile={vi.fn()}
      onChooseLegacyBundleFolder={vi.fn()}
      onChooseLocalProjectFolder={vi.fn()}
      onChooseRelinkFolder={vi.fn()}
      onExportPortableBundle={vi.fn()}
      onReviewPortableRestore={vi.fn()}
      onConfirmPortableRestore={vi.fn()}
      onCancelPortableRestore={vi.fn()}
      onRefreshDiagnostics={vi.fn()}
      onCopySupportDiagnostics={vi.fn()}
      onCopyMarkdown={vi.fn()}
      onConfirmRelink={vi.fn()}
      onCancelRelink={vi.fn()}
      {...overrides}
    />
  );
}

describe("Utilities", () => {
  it("keeps Markdown exports collapsed until a plan is opened", async () => {
    const user = userEvent.setup();
    renderUtilities();

    expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Markdown export" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Each plan has its own Markdown export, so multiple plans stay separate when copied, shared, or archived."
      )
    ).toBeInTheDocument();
    const exportDetails = screen.getByText("Foundation plan").closest("details");
    expect(exportDetails).not.toHaveAttribute("open");

    await user.click(screen.getByText("Foundation plan"));

    expect(exportDetails).toHaveAttribute("open");
    expect(screen.getByLabelText("Foundation plan Markdown preview")).toHaveValue(
      "# Desclop — Foundation plan\n\n## Foundation"
    );
    expect(screen.getByLabelText("Foundation plan Markdown preview")).toHaveAttribute("readonly");
  });

  it("shows portable feedback and opens plan import", async () => {
    const user = userEvent.setup();
    const onOpenImport = vi.fn();

    renderUtilities({
      portableError: "Portable export failed.",
      portableStatus: "Portable backup restored.",
      onOpenImport
    });

    expect(screen.getByText("Portable export failed.")).toBeInTheDocument();
    expect(screen.getByText("Portable backup restored.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import plan" }));

    expect(onOpenImport).toHaveBeenCalledTimes(1);
  });

  it("uses destination, backup-file, and project-folder controls", async () => {
    const user = userEvent.setup();
    const onChooseBundleDestination = vi.fn();
    const onChooseBundleFile = vi.fn();
    const onChooseLocalProjectFolder = vi.fn();

    renderUtilities({
      bundleDestination: "/tmp/backups",
      reselectedLocalPath: "/tmp/desclop",
      onChooseBundleDestination,
      onChooseBundleFile,
      onChooseLocalProjectFolder
    });

    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Choose backup file" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));

    expect(onChooseBundleDestination).toHaveBeenCalledTimes(1);
    expect(onChooseBundleFile).toHaveBeenCalledTimes(1);
    expect(onChooseLocalProjectFolder).toHaveBeenCalledTimes(1);
  });

  it("keeps portable actions disabled until required folders are selected", () => {
    renderUtilities({
      bundleDestination: "",
      bundleFolder: "/tmp/backup",
      reselectedLocalPath: ""
    });

    expect(screen.getByRole("button", { name: "Export portable backup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review portable restore" })).toBeDisabled();
  });

  it("keeps portable actions disabled for whitespace-only folder selections", () => {
    renderUtilities({
      bundleDestination: "   ",
      bundleFolder: "\t",
      reselectedLocalPath: "\n"
    });

    expect(screen.getByRole("button", { name: "Export portable backup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review portable restore" })).toBeDisabled();
  });

  it("submits portable actions when folder selections are valid", async () => {
    const user = userEvent.setup();
    const onExportPortableBundle = vi.fn();
    const onReviewPortableRestore = vi.fn();

    renderUtilities({
      bundleDestination: "/tmp/backups",
      bundleFolder: "/tmp/backup",
      reselectedLocalPath: "/tmp/desclop",
      onExportPortableBundle,
      onReviewPortableRestore
    });

    await user.click(screen.getByRole("button", { name: "Export portable backup" }));
    await user.click(screen.getByRole("button", { name: "Review portable restore" }));

    expect(onExportPortableBundle).toHaveBeenCalledTimes(1);
    expect(onReviewPortableRestore).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit confirmation before portable restore or folder relink", async () => {
    const user = userEvent.setup();
    const onConfirmPortableRestore = vi.fn();
    const onConfirmRelink = vi.fn();

    renderUtilities({
      relinkPath: "/tmp/relinked",
      restorePreview: {
        formatVersion: 3,
        compatibility: "current",
        projectName: "Imported project",
        planCount: 1,
        stageCount: 1,
        taskCount: 2,
        checklistItemCount: 0,
        noteCount: 1,
        workEntryCount: 1
      },
      onConfirmPortableRestore,
      onConfirmRelink
    });

    expect(screen.getByRole("region", { name: "Confirm portable restore" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Confirm folder relink" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm restore" }));
    await user.click(screen.getByRole("button", { name: "Confirm relink" }));

    expect(onConfirmPortableRestore).toHaveBeenCalledTimes(1);
    expect(onConfirmRelink).toHaveBeenCalledTimes(1);
  });

  it("shows separate Markdown exports and copies the selected plan", async () => {
    const user = userEvent.setup();
    const onCopyMarkdown = vi.fn();

    renderUtilities({
      markdownExports: [
        { id: "plan-1", title: "Alpha", markdown: "# Alpha" },
        { id: "plan-2", title: "Beta", markdown: "# Beta" }
      ],
      onCopyMarkdown
    });

    const alphaExport = screen.getByText("Alpha").closest("details");
    const betaExport = screen.getByText("Beta").closest("details");
    expect(alphaExport).not.toHaveAttribute("open");
    expect(betaExport).not.toHaveAttribute("open");

    await user.click(screen.getByText("Beta"));

    expect(alphaExport).not.toHaveAttribute("open");
    expect(betaExport).toHaveAttribute("open");
    expect(screen.getByLabelText("Beta Markdown preview")).toHaveValue("# Beta");
    const copyButton = within(betaExport as HTMLDetailsElement).getByRole("button", {
      name: "Copy"
    });
    expect(copyButton).toHaveClass("utilities-markdown-export__copy");
    await user.click(copyButton);

    expect(onCopyMarkdown).toHaveBeenCalledWith("# Beta", "Beta");
  });

  it("keeps technical diagnostics behind the support disclosure", async () => {
    const user = userEvent.setup();
    const onCopySupportDiagnostics = vi.fn();

    renderUtilities({
      diagnostics: {
        appVersion: "0.2.0-beta.2",
        projectPath: "/tmp/desclop",
        folderState: "available",
        git: { configured: true, repositoryDetected: true },
        database: {
          state: "ready",
          schemaVersion: 4,
          targetSchemaVersion: 4,
          integrity: "ok"
        },
        lastBackup: {
          state: "none",
          kind: null,
          createdAt: null,
          formatVersion: null,
          schemaVersion: null
        },
        relinkAvailable: true,
        supportReport: {
          diagnosticFormatVersion: 1,
          appVersion: "0.2.0-beta.2",
          folderState: "available",
          git: { configured: true, repositoryDetected: true },
          database: {
            state: "ready",
            schemaVersion: 4,
            targetSchemaVersion: 4,
            integrity: "ok"
          },
          lastBackup: {
            state: "none",
            kind: null,
            createdAt: null,
            formatVersion: null,
            schemaVersion: null
          },
          relinkAvailable: true
        }
      },
      onCopySupportDiagnostics
    });

    expect(screen.getByText("For support")).toBeInTheDocument();
    await user.click(screen.getByText("For support"));
    const supportReport = screen.getByText("For support").closest("details");
    await user.click(within(supportReport as HTMLDetailsElement).getByRole("button", { name: "Copy" }));

    expect(onCopySupportDiagnostics).toHaveBeenCalledTimes(1);
  });
});
