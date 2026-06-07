import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { WorkReview } from "./WorkReview";

describe("WorkReview", () => {
  it("renders manual work review as a clear form", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(<WorkReview durationSeconds={null} onSave={onSave} />);

    expect(screen.getByRole("heading", { name: "Work review" })).toBeInTheDocument();
    expect(
      screen.getByText("Capture what changed and the next step before leaving this task.")
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("What was done"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains"), "Run backend tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

    expect(onSave).toHaveBeenCalledWith({
      done: "Reviewed schema",
      remains: "Run backend tests",
      nextStep: "Run cargo test",
      durationSeconds: null
    });
  });

  it("saves compact review fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

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

  it("keeps review text, shows an error, and prevents duplicate saves while pending", async () => {
    const user = userEvent.setup();
    let rejectSave: (error: Error) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        })
    );

    renderWithRouter(<WorkReview durationSeconds={900} onSave={onSave} />);

    await user.type(screen.getByLabelText("What was done"), "Added migration");
    await user.type(screen.getByLabelText("What remains"), "Repository tests");
    await user.type(screen.getByLabelText("Next step"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save work review" }));

    expect(screen.getByRole("button", { name: "Saving work review" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving work review" }));
    expect(onSave).toHaveBeenCalledTimes(1);

    rejectSave(new Error("database unavailable"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save work review.");
    expect(screen.getByLabelText("What was done")).toHaveValue("Added migration");
    expect(screen.getByLabelText("What remains")).toHaveValue("Repository tests");
    expect(screen.getByLabelText("Next step")).toHaveValue("Run cargo test");
    expect(screen.getByRole("button", { name: "Save work review" })).toBeEnabled();
  });
});
