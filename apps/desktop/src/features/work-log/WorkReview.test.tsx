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
      screen.getByText("Write enough that you can resume without reconstructing the session.")
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("What changed?"), "Reviewed schema");
    await user.type(screen.getByLabelText("What remains?"), "Run backend tests");
    await user.type(screen.getByLabelText("Next action"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(onSave).toHaveBeenCalledWith({
      done: "Reviewed schema",
      remains: "Run backend tests",
      nextStep: "Run cargo test",
      durationSeconds: null,
      noMeaningfulProgress: false
    });
  });

  it("saves compact review fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(<WorkReview durationSeconds={900} onSave={onSave} />);

    await user.type(screen.getByLabelText("What changed?"), "Added migration");
    await user.type(screen.getByLabelText("What remains?"), "Repository tests");
    await user.type(screen.getByLabelText("Next action"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(onSave).toHaveBeenCalledWith({
      done: "Added migration",
      remains: "Repository tests",
      nextStep: "Run cargo test",
      durationSeconds: 900,
      noMeaningfulProgress: false
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

    await user.type(screen.getByLabelText("What changed?"), "Added migration");
    await user.type(screen.getByLabelText("What remains?"), "Repository tests");
    await user.type(screen.getByLabelText("Next action"), "Run cargo test");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(screen.getByRole("button", { name: "Saving review" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving review" }));
    expect(onSave).toHaveBeenCalledTimes(1);

    rejectSave(new Error("database unavailable"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save work review.");
    expect(screen.getByLabelText("What changed?")).toHaveValue("Added migration");
    expect(screen.getByLabelText("What remains?")).toHaveValue("Repository tests");
    expect(screen.getByLabelText("Next action")).toHaveValue("Run cargo test");
    expect(screen.getByRole("button", { name: "Save review" })).toBeEnabled();
  });

  it("requires meaningful progress or an explicit no-progress choice", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderWithRouter(<WorkReview durationSeconds={1500} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText("Add what changed or choose No meaningful progress.")
    ).toBeInTheDocument();
  });

  it("preserves draft text when saving fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("disk"));

    renderWithRouter(<WorkReview durationSeconds={1500} onSave={onSave} />);

    await user.type(screen.getByLabelText("What changed?"), "Removed inline capture");
    await user.click(screen.getByRole("button", { name: "Save review" }));

    expect(await screen.findByText("Could not save work review.")).toBeInTheDocument();
    expect(screen.getByLabelText("What changed?")).toHaveValue("Removed inline capture");
  });

  it("can intentionally save a session without review", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <WorkReview durationSeconds={1500} onSave={vi.fn()} onSkip={onSkip} />
    );

    await user.click(screen.getByRole("button", { name: "Save session without review" }));

    expect(onSkip).toHaveBeenCalledWith({ durationSeconds: 1500 });
  });
});
