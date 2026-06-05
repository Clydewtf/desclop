import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ActionBar,
  Button,
  EmptyState,
  InlineAlert,
  ScreenHeader,
  SectionHeader,
  SelectField,
  StatusBadge,
  Surface,
  TaskStatusBadge,
  TextArea,
  TextField
} from "./index";

describe("shared UI primitives", () => {
  it("renders accessible buttons with visual variants", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <div>
        <Button variant="primary" onClick={onClick}>Continue</Button>
        <Button variant="secondary">Open plan</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Delete</Button>
        <Button icon={<span data-testid="button-icon">Icon</span>}>With icon</Button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass("ui-button--primary");
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Open plan" })).toHaveClass("ui-button--secondary");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("ui-button--ghost");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("ui-button--danger");
    expect(screen.getByRole("button", { name: "With icon" })).toHaveClass("ui-button--with-icon");
    expect(screen.getByTestId("button-icon").parentElement).toHaveClass("ui-button__icon");
    expect(screen.getByTestId("button-icon").parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("renders labeled fields and alerts", () => {
    render(
      <div>
        <TextField id="task-title" label="Task title" value="Create shell" onChange={() => {}} />
        <TextArea id="next-step" label="Next step" value="Run tests" onChange={() => {}} />
        <InlineAlert tone="warning">Git unavailable.</InlineAlert>
      </div>
    );

    expect(screen.getByLabelText("Task title")).toHaveValue("Create shell");
    expect(screen.getByLabelText("Next step")).toHaveValue("Run tests");
    expect(screen.getByRole("status")).toHaveTextContent("Git unavailable.");
  });

  it("wires field hints to accessible descriptions", () => {
    render(
      <div>
        <p id="task-title-extra">Shown in Today.</p>
        <TextField
          id="task-title-described"
          label="Task title described"
          hint="Use a concise action name."
          aria-describedby="task-title-extra"
          value="Create shell"
          onChange={() => {}}
        />
        <TextArea
          id="next-step-described"
          label="Next step described"
          hint="Keep this directly actionable."
          value="Run tests"
          onChange={() => {}}
        />
        <SelectField id="status-described" label="Status described" hint="Choose the current task state.">
          <option value="active">Active</option>
        </SelectField>
      </div>
    );

    expect(screen.getByLabelText("Task title described")).toHaveAttribute(
      "aria-describedby",
      "task-title-extra task-title-described-hint"
    );
    expect(screen.getByLabelText("Task title described")).toHaveAccessibleDescription(
      "Shown in Today. Use a concise action name."
    );
    expect(screen.getByLabelText("Next step described")).toHaveAccessibleDescription(
      "Keep this directly actionable."
    );
    expect(screen.getByLabelText("Status described")).toHaveAccessibleDescription(
      "Choose the current task state."
    );
  });

  it("preserves required field classes when caller classes are provided", () => {
    render(
      <div>
        <TextField
          id="task-title-custom"
          label="Task title custom"
          className="custom-input"
          value="Create shell"
          onChange={() => {}}
        />
        <TextArea
          id="next-step-custom"
          label="Next step custom"
          className="custom-textarea"
          value="Run tests"
          onChange={() => {}}
        />
        <SelectField id="status-custom" label="Status custom" className="custom-select" value="active" onChange={() => {}}>
          <option value="active">Active</option>
        </SelectField>
      </div>
    );

    expect(screen.getByLabelText("Task title custom")).toHaveClass("ui-input", "custom-input");
    expect(screen.getByLabelText("Next step custom")).toHaveClass("ui-textarea", "custom-textarea");
    expect(screen.getByLabelText("Status custom")).toHaveClass("ui-select", "custom-select");
  });

  it("renders surfaces, headers, empty states, badges, and action bars", () => {
    render(
      <Surface ariaLabel="Current task">
        <ScreenHeader eyebrow="Today" title="Continue where you left off" actions={<Button>Continue</Button>} />
        <SectionHeader title="Resume facts" action={<Button variant="ghost">Refresh</Button>} />
        <StatusBadge tone="success">Ready</StatusBadge>
        <TaskStatusBadge status="active" />
        <EmptyState
          title="No plan imported"
          body="Import a Markdown plan to start using Today."
          action={<Button>Import plan</Button>}
        />
        <ActionBar>
          <Button>Save</Button>
          <Button variant="secondary">Cancel</Button>
        </ActionBar>
      </Surface>
    );

    expect(screen.getByLabelText("Current task")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Continue where you left off" })).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No plan imported" })).toBeInTheDocument();
  });
});
