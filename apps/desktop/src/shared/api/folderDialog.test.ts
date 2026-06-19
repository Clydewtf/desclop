import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseFolder } from "./folderDialog";

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
});
