import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "./test-utils";
import { App } from "./App";

describe("App", () => {
  it("renders the desktop shell", () => {
    renderWithRouter(<App />);
    expect(screen.getByText("Desclop")).toBeInTheDocument();
  });
});
