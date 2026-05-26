import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { WorkReview } from "./WorkReview";

describe("WorkReview", () => {
  it("saves compact review fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderWithRouter(<WorkReview durationSeconds={900} onSave={onSave} />);

    await user.type(screen.getByLabelText("What was done"), "Added migration");
    await user.type(screen.getByLabelText("What remains"), "Repository tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

    expect(onSave).toHaveBeenCalledWith({
      done: "Added migration",
      remains: "Repository tests",
      nextStep: "Run cargo test",
      durationSeconds: 900
    });
  });
});
