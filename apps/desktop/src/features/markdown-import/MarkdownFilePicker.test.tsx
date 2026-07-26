import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { MarkdownFilePicker } from "./MarkdownFilePicker";

function markdownFile(name: string, text = "# Plan") {
  const file = new File([text], name, { type: "text/markdown" });
  Object.defineProperty(file, "path", { value: `/tmp/${name}` });
  return file;
}

function ControlledPicker({
  draft,
  onFileLoaded,
  onError,
  onChooseFile,
  onReadFile
}: {
  draft: string;
  onFileLoaded: (file: { name: string; text: string }) => void;
  onError: (message: string) => void;
  onChooseFile: () => Promise<string | null>;
  onReadFile: (filePath: string) => Promise<{ fileName: string; text: string }>;
}) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <MarkdownFilePicker
      draft={draft}
      fileName={fileName}
      onChooseFile={onChooseFile}
      onReadFile={onReadFile}
      onFileLoaded={(file) => {
        setFileName(file.name);
        onFileLoaded(file);
      }}
      onError={onError}
    />
  );
}

describe("MarkdownFilePicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads one supported file, shows only its name, and offers replacement", async () => {
    const onFileLoaded = vi.fn();
    const onError = vi.fn();
    const onChooseFile = vi.fn().mockResolvedValue("/tmp/roadmap.markdown");
    const onReadFile = vi.fn().mockResolvedValue({
      fileName: "roadmap.markdown",
      text: "# Roadmap"
    });

    renderWithRouter(
      <ControlledPicker
        draft=""
        onFileLoaded={onFileLoaded}
        onError={onError}
        onChooseFile={onChooseFile}
        onReadFile={onReadFile}
      />
    );

    await fireEvent.click(screen.getByRole("button", { name: "Choose Markdown file" }));

    await waitFor(() =>
      expect(onFileLoaded).toHaveBeenCalledWith({ name: "roadmap.markdown", text: "# Roadmap" })
    );
    expect(screen.getByText("Selected file: roadmap.markdown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace file" })).toBeInTheDocument();
    expect(screen.queryByText(/\/Users\/|\/tmp\//)).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
    expect(onReadFile).toHaveBeenCalledWith("/tmp/roadmap.markdown");
  });

  it("accepts a dropped text file and rejects multiple files", async () => {
    const onFileLoaded = vi.fn();
    const onError = vi.fn();
    const onChooseFile = vi.fn().mockResolvedValue(null);
    const onReadFile = vi.fn().mockResolvedValue({ fileName: "notes.txt", text: "# Notes" });

    renderWithRouter(
      <MarkdownFilePicker
        draft=""
        onChooseFile={onChooseFile}
        onReadFile={onReadFile}
        onFileLoaded={onFileLoaded}
        onError={onError}
      />
    );

    const dropZone = screen.getByRole("group", { name: "Markdown file drop zone" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [markdownFile("notes.txt")] } });
    await waitFor(() => expect(onFileLoaded).toHaveBeenCalledTimes(1));

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [markdownFile("one.md"), markdownFile("two.md")] }
    });

    expect(onError).toHaveBeenCalledWith("Drop one Markdown file at a time.");
  });

  it("rejects unsupported extensions and keeps a different draft when replacement is declined", async () => {
    const onFileLoaded = vi.fn();
    const onError = vi.fn();
    const onChooseFile = vi
      .fn()
      .mockResolvedValueOnce("/tmp/plan.pdf")
      .mockResolvedValueOnce("/tmp/replacement.md");
    const onReadFile = vi.fn().mockResolvedValue({
      fileName: "replacement.md",
      text: "# Replacement"
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithRouter(
      <MarkdownFilePicker
        draft="# Existing draft"
        onChooseFile={onChooseFile}
        onReadFile={onReadFile}
        onFileLoaded={onFileLoaded}
        onError={onError}
      />
    );

    await fireEvent.click(screen.getByRole("button", { name: "Choose Markdown file" }));
    expect(onError).toHaveBeenCalledWith(
      "Choose a Markdown file with a .md, .markdown, or .txt extension."
    );

    await fireEvent.click(screen.getByRole("button", { name: "Choose Markdown file" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    expect(onFileLoaded).not.toHaveBeenCalled();
    expect(screen.getByText("Import from a file")).toBeInTheDocument();
  });

  it("reports cancellation and local read failures without replacing the existing draft", async () => {
    const onFileLoaded = vi.fn();
    const onError = vi.fn();
    const onChooseFile = vi.fn();
    onChooseFile.mockResolvedValueOnce(null);
    ["/tmp/empty.md", "/tmp/too-large.md", "/tmp/missing.md", "/tmp/invalid.txt"].forEach((filePath) => {
      onChooseFile.mockResolvedValueOnce(filePath);
    });

    const onReadFile = vi.fn().mockResolvedValueOnce({ fileName: "empty.md", text: "\n  " });
    onReadFile
      .mockRejectedValueOnce("The Markdown file is too large. The maximum size is 1 MB.")
      .mockRejectedValueOnce("The selected Markdown file does not exist.")
      .mockRejectedValueOnce("The Markdown file must use UTF-8 encoding.");

    renderWithRouter(
      <MarkdownFilePicker
        draft="# Existing draft"
        onChooseFile={onChooseFile}
        onReadFile={onReadFile}
        onFileLoaded={onFileLoaded}
        onError={onError}
      />
    );

    const chooseButton = screen.getByRole("button", { name: "Choose Markdown file" });
    const expectedErrors = [
      "File selection cancelled. The current draft was kept.",
      "The Markdown file is empty. Add Markdown content and try again.",
      "The Markdown file is too large. The maximum size is 1 MB.",
      "The selected Markdown file does not exist.",
      "The Markdown file must use UTF-8 encoding."
    ];

    for (const [index, expectedError] of expectedErrors.entries()) {
      await fireEvent.click(chooseButton);
      await waitFor(() => expect(onError).toHaveBeenNthCalledWith(index + 1, expectedError));
    }

    expect(onFileLoaded).not.toHaveBeenCalled();
    expect(onReadFile).toHaveBeenCalledTimes(4);
    expect(screen.getByText("Import from a file")).toBeInTheDocument();
  });
});
