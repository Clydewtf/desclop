import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { FocusMode } from "./FocusMode";

describe("FocusMode", () => {
  it("shows task, checklist, quick note, inbox capture, and finish control", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const onCaptureInbox = vi.fn();

    renderWithRouter(
      <FocusMode
        task={{ id: "t1", projectId: "p1", stageId: "s1", title: "Create local store", description: "", status: "active", priority: null, dueDate: null, nextStep: "", position: 0 }}
        checklist={[{ id: "c1", taskId: "t1", title: "Add migration", completed: false, position: 0 }]}
        mode="ambient"
        startedAtMs={0}
        nowMs={60000}
        timeboxMinutes={null}
        onFinish={onFinish}
        onCaptureInbox={onCaptureInbox}
      />
    );

    expect(screen.getByText("Create local store")).toBeInTheDocument();
    expect(screen.getByText("01:00")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Add migration" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quick note")).toBeInTheDocument();
    expect(screen.getByLabelText("Capture")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish focus session" }));

    expect(onFinish).toHaveBeenCalledWith({ elapsedSeconds: 60 });
  });

  it("captures inbox items during focus", async () => {
    const user = userEvent.setup();
    const onCaptureInbox = vi.fn();

    renderWithRouter(
      <FocusMode
        task={{ id: "t1", projectId: "p1", stageId: "s1", title: "Create local store", description: "", status: "active", priority: null, dueDate: null, nextStep: "", position: 0 }}
        checklist={[]}
        mode="timebox"
        startedAtMs={0}
        nowMs={60000}
        timeboxMinutes={5}
        onFinish={vi.fn()}
        onCaptureInbox={onCaptureInbox}
      />
    );

    expect(screen.getByText("04:00 remaining")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Capture"), "Remember repository tests");
    await user.selectOptions(screen.getByLabelText("Capture type"), "note");
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(onCaptureInbox).toHaveBeenCalledWith({
      body: "Remember repository tests",
      kind: "note"
    });
  });
});
