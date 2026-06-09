import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Utilities } from "./Utilities";

describe("Utilities", () => {
  it("keeps maintenance actions secondary and opens import from setup actions", async () => {
    const user = userEvent.setup();
    const onOpenImport = vi.fn();

    renderWithRouter(
      <Utilities
        projectPath="/tmp/desclop"
        gitEnabled={true}
        gitHealth="Git unavailable."
        onOpenImport={onOpenImport}
      />
    );

    expect(screen.getByRole("heading", { name: "Export / Settings" })).toBeInTheDocument();
    expect(screen.getByText("/tmp/desclop")).toBeInTheDocument();
    expect(screen.getByText("Git unavailable.")).toBeInTheDocument();
    expect(
      screen.getByText("Portable bundles do not copy source code.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import plan" }));
    expect(onOpenImport).toHaveBeenCalledTimes(1);
  });
});
