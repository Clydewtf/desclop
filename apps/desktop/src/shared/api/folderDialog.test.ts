import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseFolder, chooseMarkdownFile, choosePortableBackupFile } from "./folderDialog";

const { open } = vi.hoisted(() => ({
  open: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

describe("chooseFolder", () => {
  beforeEach(() => {
    open.mockReset();
  });

  it("returns the selected folder path", async () => {
    open.mockResolvedValue("/path/to/project");

    await expect(chooseFolder()).resolves.toBe("/path/to/project");
    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false
    });
  });

  it("returns null when the dialog is cancelled", async () => {
    open.mockResolvedValue(null);

    await expect(chooseFolder()).resolves.toBeNull();
  });

  it("returns null when the dialog returns multiple paths", async () => {
    open.mockResolvedValue(["/path/to/project"]);

    await expect(chooseFolder()).resolves.toBeNull();
  });

  it("filters for a single Desclop backup file", async () => {
    open.mockResolvedValue("/path/to/Desclop.desclop");

    await expect(choosePortableBackupFile()).resolves.toBe("/path/to/Desclop.desclop");
    expect(open).toHaveBeenCalledWith({
      directory: false,
      multiple: false,
      filters: [{ name: "Desclop backup", extensions: ["desclop"] }]
    });
  });

  it("filters for one Markdown plan file", async () => {
    open.mockResolvedValue("/path/to/plan.markdown");

    await expect(chooseMarkdownFile()).resolves.toBe("/path/to/plan.markdown");
    expect(open).toHaveBeenCalledWith({
      directory: false,
      multiple: false,
      filters: [{ name: "Markdown plan", extensions: ["md", "markdown", "txt"] }]
    });
  });
});
