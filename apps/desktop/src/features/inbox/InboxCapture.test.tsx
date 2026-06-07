import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { InboxCapture } from "./InboxCapture";

describe("InboxCapture", () => {
  it("captures alpha capture kinds with simplified labels", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(<InboxCapture onCapture={onCapture} />);

    await user.type(screen.getByLabelText("Capture"), "Check export shape");
    await user.selectOptions(screen.getByLabelText("Capture type"), "task_candidate");
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(screen.getByRole("option", { name: "Follow-up" })).toHaveValue("task_candidate");
    expect(onCapture).toHaveBeenCalledWith({
      body: "Check export shape",
      kind: "task_candidate"
    });
  });

  it("captures typed and untyped items without interrupting work", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(<InboxCapture onCapture={onCapture} />);

    await user.type(screen.getByLabelText("Capture"), "Investigate import warning");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(onCapture).toHaveBeenCalledWith({
      body: "Investigate import warning",
      kind: "question"
    });
    expect(screen.getByLabelText("Capture")).toHaveValue("");
    expect(screen.getByLabelText("Capture type")).toHaveValue("untyped");
  });

  it("keeps capture text and shows an error when capture fails", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn().mockRejectedValue(new Error("database unavailable"));

    renderWithRouter(<InboxCapture onCapture={onCapture} />);

    await user.type(screen.getByLabelText("Capture"), "Investigate import warning");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not capture inbox item.");
    expect(screen.getByLabelText("Capture")).toHaveValue("Investigate import warning");
    expect(screen.getByLabelText("Capture type")).toHaveValue("question");
  });
});
