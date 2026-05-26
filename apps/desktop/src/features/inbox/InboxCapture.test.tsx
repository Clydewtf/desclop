import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { InboxCapture } from "./InboxCapture";

describe("InboxCapture", () => {
  it("captures typed and untyped items without interrupting work", async () => {
    const user = userEvent.setup();
    const onCapture = vi.fn();

    renderWithRouter(<InboxCapture onCapture={onCapture} />);

    await user.type(screen.getByLabelText("Capture"), "Investigate import warning");
    await user.selectOptions(screen.getByLabelText("Capture type"), "question");
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(onCapture).toHaveBeenCalledWith({
      body: "Investigate import warning",
      kind: "question"
    });
  });
});
