import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import type { InboxItem, Note, Task, WorkEntry } from "../../shared/domain/types";
import "../../styles/base.css";
import { WeeklyReview } from "./WeeklyReview";
import { buildWeeklyReview } from "./weeklyReviewEngine";

describe("WeeklyReview", () => {
  const now = new Date(2026, 5, 16, 12);
  const timestamp = (day: number, hour = 10) =>
    new Date(2026, 5, day, hour).toISOString();

  it("explains an empty project and offers the first local next step", async () => {
    const user = userEvent.setup();
    const onOpenImport = vi.fn();
    const review = buildWeeklyReview({
      project: { activeTaskId: null },
      tasks: [],
      inboxItems: [],
      workEntries: [],
      notes: [],
      commits: [],
      now
    });

    renderWithRouter(
      <WeeklyReview
        review={review}
        hasPlan={false}
        onOpenTask={vi.fn()}
        onOpenTimeline={vi.fn()}
        onOpenPlan={vi.fn()}
        onOpenImport={onOpenImport}
        onOpenToday={vi.fn()}
        onStartManualWorkReview={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Weekly Review" })).toBeInTheDocument();
    expect(screen.getByText("No local activity yet")).toBeInTheDocument();
    expect(screen.getByText("0/7 active days")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Activity heatmap" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Needs attention" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Last handoff" })).not.toBeInTheDocument();
    const nextStep = screen.getByRole("article", { name: "Review next step" });
    expect(within(nextStep).getByRole("button", { name: "Import a plan" })).toBeInTheDocument();

    await user.click(within(nextStep).getByRole("button", { name: "Import a plan" }));

    expect(onOpenImport).toHaveBeenCalledTimes(1);
  });

  it("navigates from source records back to tasks and Timeline", async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const onOpenTimeline = vi.fn();
    const onOpenToday = vi.fn();
    const review = buildWeeklyReview({
      project: { activeTaskId: "active-task" },
      tasks: [
        task({ id: "completed-task", title: "Completed task", status: "done", completedAt: timestamp(16) }),
        task({ id: "active-task", title: "Active task", status: "active", nextStep: "Run tests" }),
        task({ id: "missing-next", title: "Missing next action", nextStep: "   " })
      ],
      inboxItems: [inbox({ id: "capture", body: "Investigate this", taskId: null })],
      workEntries: [work({ id: "review", taskId: "active-task", createdAt: timestamp(15) })],
      notes: [note({ createdAt: timestamp(14) })],
      commits: [],
      now
    });

    renderWithRouter(
      <WeeklyReview
        review={review}
        hasPlan
        onOpenTask={onOpenTask}
        onOpenTimeline={onOpenTimeline}
        onOpenPlan={vi.fn()}
        onOpenImport={vi.fn()}
        onOpenToday={onOpenToday}
        onStartManualWorkReview={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Continue in Today" }));
    expect(onOpenToday).toHaveBeenCalledTimes(1);

    const completedCard = screen.getByRole("article", { name: "Completed tasks" });
    await user.click(within(completedCard).getByText("Show source records"));
    await user.click(within(completedCard).getByRole("button", { name: "Open task" }));
    expect(onOpenTask).toHaveBeenCalledWith("completed-task");

    const capturesCard = screen.getByRole("article", { name: "Open captures" });
    await user.click(within(capturesCard).getByText("Show source records"));
    const captureTitle = within(capturesCard).getByText("Investigate this", {
      selector: ".weekly-review__record-title"
    });
    const openTimeline = within(capturesCard).getByRole("button", { name: "Open Timeline" });
    expect(captureTitle).toHaveClass("weekly-review__record-title");
    expect(captureTitle).not.toHaveAttribute("title");
    expect(openTimeline).toHaveClass(
      "ui-icon-button",
      "ui-icon-button--ghost",
      "ui-icon-button--compact",
      "weekly-review__record-action"
    );
    expect(openTimeline).toHaveAttribute("title", "");
    expect(getComputedStyle(openTimeline).width).toBe("var(--control-size-compact)");
    await user.hover(captureTitle);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(openTimeline);
    const actionTooltip = screen.getByRole("tooltip");
    expect(actionTooltip).toHaveTextContent("Open Timeline");
    await user.click(openTimeline);
    expect(onOpenTimeline).toHaveBeenCalledTimes(1);

    const workCard = screen.getByRole("article", { name: "Work reviews" });
    await user.click(within(workCard).getByText("Show source records"));
    await user.click(within(workCard).getByRole("button", { name: "Open task" }));
    expect(onOpenTask).toHaveBeenCalledWith("active-task");

    const activityCard = screen.getByRole("article", { name: "Activity heatmap" });
    const activeDay = within(activityCard).getByRole("button", { name: /2 activities/ });
    expect(activeDay).toHaveClass("weekly-review__heatmap-cell--level-2");
    expect(getComputedStyle(activeDay).padding).toBe("0px");
    expect(activeDay).not.toHaveAttribute("title");
    await user.hover(activeDay);
    expect(
      within(activityCard).getByText("Tue, Jun 16 · 2 activities", {
        selector: ".weekly-review__heatmap-tooltip-panel"
      })
    ).toBeVisible();
    await user.click(activeDay);
    expect(
      within(activityCard).getByText("Investigate this", {
        selector: ".weekly-review__record-title"
      })
    ).toBeInTheDocument();
    expect(within(activityCard).getByText(/^capture · /).closest(".ui-hover-tooltip")).toBeNull();
    expect(screen.queryByText(/^Source:/)).not.toBeInTheDocument();
    await user.click(within(activityCard).getByRole("button", { name: "Open record" }));
    expect(onOpenTimeline).toHaveBeenLastCalledWith({
      dateKey: "2026-06-16",
      itemKey: "capture:capture"
    });
    await user.click(within(activityCard).getByRole("button", { name: "Open Timeline" }));
    expect(onOpenTimeline).toHaveBeenCalledTimes(3);
  });

  it("keeps handoff context without duplicating the source metrics", () => {
    const review = buildWeeklyReview({
      project: { activeTaskId: "active-task" },
      tasks: [
        task({ id: "active-task", title: "Active task", status: "active", nextStep: "Run tests" }),
        task({ id: "blocked-task", title: "Blocked task", status: "blocked", nextStep: "Wait" }),
        task({ id: "missing-next", title: "Missing next action", nextStep: "" })
      ],
      inboxItems: [inbox({ id: "open-capture", body: "Capture waiting" })],
      workEntries: [work({ id: "handoff", done: "Reviewed the handoff", createdAt: timestamp(15) })],
      notes: [],
      commits: [],
      gitStatus: {
        enabled: true,
        unavailable: false,
        syncedAt: timestamp(16, 11)
      },
      now
    });

    renderWithRouter(
      <WeeklyReview
        review={review}
        hasPlan
        onOpenTask={vi.fn()}
        onOpenTimeline={vi.fn()}
        onOpenPlan={vi.fn()}
        onOpenImport={vi.fn()}
        onOpenToday={vi.fn()}
        onStartManualWorkReview={vi.fn()}
      />
    );

    expect(screen.queryByRole("article", { name: "Needs attention" })).not.toBeInTheDocument();
    const articleNames = screen
      .getAllByRole("article")
      .map((article) => article.getAttribute("aria-label"));
    expect(articleNames.slice(0, 3)).toEqual([
      "Resume readiness",
      "Activity heatmap",
      "Last handoff"
    ]);
    const handoff = screen.getByRole("article", { name: "Last handoff" });
    expect(handoff).toBeInTheDocument();
    expect(screen.getByText(/Git history: synced/)).toBeInTheDocument();
    expect(within(handoff).getByText("Reviewed the handoff")).toBeInTheDocument();
  });
});

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task",
    projectId: "p1",
    stageId: "s1",
    title: "Task",
    description: "",
    status: "todo",
    priority: null,
    dueDate: null,
    nextStep: "Next action",
    position: 0,
    ...overrides
  };
}

function inbox(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "inbox",
    projectId: "p1",
    taskId: null,
    body: "Capture",
    kind: "note",
    status: "open",
    createdAt: "2026-06-16T10:00:00.000Z",
    updatedAt: "2026-06-16T10:00:00.000Z",
    ...overrides
  };
}

function work(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: "work",
    projectId: "p1",
    taskId: null,
    source: "manual",
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    done: "Reviewed work",
    remains: "",
    nextStep: "",
    createdAt: "2026-06-16T10:00:00.000Z",
    ...overrides
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note",
    projectId: "p1",
    taskId: null,
    body: "Note",
    createdAt: "2026-06-16T10:00:00.000Z",
    ...overrides
  };
}
