import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "./test-utils";
import { App } from "./App";

vi.mock("../shared/api/client", () => ({
  api: {
    listProjects: vi.fn().mockResolvedValue([]),
    createProject: vi.fn()
  }
}));

describe("App", () => {
  it("renders the desktop shell", async () => {
    renderWithRouter(<App />);
    expect(await screen.findByText("Desclop")).toBeInTheDocument();
  });
});
