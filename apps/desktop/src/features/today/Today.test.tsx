import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Today } from "./Today";

describe("Today", () => {
  it("shows resume-first content and continue action", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    renderWithRouter(
      <Today
        view={{
          heading: "Continue where you left off",
          primaryTaskTitle: "Create local store",
          stageTitle: "Foundation",
          latestNote: "Migration passes",
          nextStep: "Run repository tests",
          facts: ["1 recent commit on main"],
          nextTasks: []
        }}
        onContinue={onContinue}
      />
    );

    expect(screen.getByText("Continue where you left off")).toBeInTheDocument();
    expect(screen.getByText("Create local store")).toBeInTheDocument();
    expect(screen.getByText("Run repository tests")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue task" }));
    expect(onContinue).toHaveBeenCalled();
  });

  it("renders inbox capture and starts manual work review", async () => {
    const user = userEvent.setup();
    const onCaptureInbox = vi.fn().mockResolvedValue(undefined);
    const onStartManualWorkReview = vi.fn();

    renderWithRouter(
      <Today
        view={{
          heading: "Continue where you left off",
          primaryTaskTitle: "Create local store",
          stageTitle: "Foundation",
          latestNote: "",
          nextStep: "Run repository tests",
          facts: [],
          nextTasks: []
        }}
        onContinue={vi.fn()}
        onCaptureInbox={onCaptureInbox}
        onStartManualWorkReview={onStartManualWorkReview}
      />
    );

    await user.type(screen.getByLabelText("Capture"), "Check export shape");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(screen.getByRole("button", { name: "Capture" }));
    await user.click(screen.getByRole("button", { name: "Add manual work review" }));

    expect(onCaptureInbox).toHaveBeenCalledWith({
      body: "Check export shape",
      kind: "question"
    });
    expect(onStartManualWorkReview).toHaveBeenCalled();
  });
});
