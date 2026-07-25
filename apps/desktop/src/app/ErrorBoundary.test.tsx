import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function BrokenScreen(): ReactElement {
  throw new Error("render failed at /Users/clyde/private-project SECRET_VALUE");
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a safe recovery state and opaque reference for render crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <BrokenScreen />
      </ErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: "Desclop needs attention" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart Desclop" })).toBeInTheDocument();
    expect(screen.getByText(/UI-/)).toBeInTheDocument();
    expect(screen.queryByText(/private-project|SECRET_VALUE|render failed/)).not.toBeInTheDocument();
  });
});
