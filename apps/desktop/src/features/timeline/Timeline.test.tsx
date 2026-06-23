import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("renders project history grouped by local date", () => {
    const workTimestamp = new Date(2026, 5, 16, 10).toISOString();
    const commitTimestamp = new Date(2026, 5, 16, 10, 5).toISOString();
    const noteTimestamp = new Date(2026, 5, 15, 16).toISOString();

    renderWithRouter(
      <Timeline
        workEntries={[
          {
            id: "w1",
            projectId: "p1",
            taskId: "t1",
            source: "manual",
            startedAt: null,
            endedAt: null,
            durationSeconds: 1800,
            done: "Reviewed schema",
            remains: "",
            nextStep: "Run tests",
            createdAt: workTimestamp
          }
        ]}
        commits={[
          {
            sha: "abcdef123",
            projectId: "p1",
            branch: "main",
            message: "Wire timeline",
            authorName: "Clyde",
            committedAt: commitTimestamp,
            changedFiles: ["Timeline.tsx"]
          }
        ]}
        notes={[
          {
            id: "n1",
            projectId: "p1",
            taskId: null,
            body: "Yesterday follow-up",
            createdAt: noteTimestamp
          }
        ]}
        inboxItems={[]}
        completedTasks={[]}
        now={new Date(2026, 5, 16, 12)}
      />
    );

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    const todayGroup = screen.getByRole("heading", { name: "Today, Jun 16" }).closest("section");
    const yesterdayGroup = screen
      .getByRole("heading", { name: "Yesterday, Jun 15" })
      .closest("section");

    expect(todayGroup).not.toBeNull();
    expect(yesterdayGroup).not.toBeNull();
    expect(within(todayGroup!).getByRole("list")).toHaveAttribute("role", "list");
    expect(within(todayGroup!).getByText("Commit")).toBeInTheDocument();
    expect(within(todayGroup!).getByText("Work review")).toBeInTheDocument();
    expect(within(todayGroup!).getByText("abcdef1 · main")).toBeInTheDocument();
    expect(within(todayGroup!).getByRole("button", { name: "1 file changed" })).toBeInTheDocument();
    expect(within(todayGroup!).getByText("Reviewed schema")).toBeInTheDocument();
    expect(within(todayGroup!).getByText("Wire timeline")).toBeInTheDocument();
    expect(within(todayGroup!).queryByText("Yesterday follow-up")).not.toBeInTheDocument();
    expect(within(yesterdayGroup!).getByText("Yesterday follow-up")).toBeInTheDocument();
    expect(within(yesterdayGroup!).queryByText("Wire timeline")).not.toBeInTheDocument();
    expect(screen.queryByText(workTimestamp)).not.toBeInTheDocument();
    expect(screen.queryByText(commitTimestamp)).not.toBeInTheDocument();
  });

  it("discloses changed files from commit metadata with keyboard-accessible controls", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <Timeline
        workEntries={[]}
        commits={[
          {
            sha: "abcdef123",
            projectId: "p1",
            branch: "main",
            message: "Wire timeline",
            authorName: "Clyde",
            committedAt: new Date(2026, 5, 16, 10, 5).toISOString(),
            changedFiles: ["Timeline.tsx", "timelineEngine.ts"]
          }
        ]}
        notes={[]}
        inboxItems={[]}
        completedTasks={[]}
        now={new Date(2026, 5, 16, 12)}
      />
    );

    const disclosure = screen.getByRole("button", { name: "2 files changed" });
    const hiddenFileList = screen.getByText("Timeline.tsx").closest(".timeline-changed-files__panel");

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(hiddenFileList).not.toBeVisible();

    await user.tab();
    const fileList = screen.getByRole("list", { name: "Files changed in Wire timeline" });
    expect(disclosure).toHaveFocus();
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(fileList).toBeVisible();
    expect(within(fileList).getByText("Timeline.tsx")).toBeInTheDocument();
    expect(within(fileList).getByText("timelineEngine.ts")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(hiddenFileList).not.toBeVisible();
  });

  it("paginates timeline events without dropping date grouping or sparse hints", async () => {
    const user = userEvent.setup();
    const commits = Array.from({ length: 26 }, (_, index) => ({
      sha: `abcdef${String(index).padStart(3, "0")}`,
      projectId: "p1",
      branch: "main",
      message: `Commit ${index + 1}`,
      authorName: "Clyde",
      committedAt: new Date(2026, 5, 16, 12, 25 - index).toISOString(),
      changedFiles: [`file-${index + 1}.ts`]
    }));

    renderWithRouter(
      <Timeline
        workEntries={[]}
        commits={commits}
        notes={[]}
        inboxItems={[]}
        completedTasks={[]}
        now={new Date(2026, 5, 16, 13)}
      />
    );

    expect(screen.getByText("Only commits so far")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today, Jun 16" })).toBeInTheDocument();
    expect(screen.getByText("Commit 1")).toBeInTheDocument();
    expect(screen.getByText("Commit 25")).toBeInTheDocument();
    expect(screen.queryByText("Commit 26")).not.toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.queryByText("Commit 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Commit 25")).not.toBeInTheDocument();
    expect(screen.getByText("Commit 26")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("keeps the empty state when production-shaped completed tasks have no timestamp", () => {
    renderWithRouter(
      <Timeline
        workEntries={[]}
        commits={[]}
        notes={[]}
        inboxItems={[]}
        completedTasks={[
          {
            id: "t1",
            projectId: "p1",
            stageId: "s1",
            title: "Undated cleanup",
            description: "",
            status: "done",
            priority: null,
            dueDate: null,
            nextStep: "",
            position: 1
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "No timeline events yet" })).toBeInTheDocument();
    expect(screen.queryByText("Undated cleanup")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Undated" })).not.toBeInTheDocument();
  });

  it("renders an actionable empty state", () => {
    renderWithRouter(
      <Timeline
        workEntries={[]}
        commits={[]}
        notes={[]}
        inboxItems={[]}
        completedTasks={[]}
      />
    );

    expect(screen.getByRole("heading", { name: "No timeline events yet" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Commits, work reviews, notes, and captures will appear here once there is activity."
      )
    ).toBeInTheDocument();
  });

  it("renders a sparse hint while keeping commit history visible", () => {
    renderWithRouter(
      <Timeline
        workEntries={[]}
        commits={[
          {
            sha: "abcdef123",
            projectId: "p1",
            branch: "main",
            message: "Wire timeline",
            authorName: "Clyde",
            committedAt: new Date(2026, 5, 16, 10, 5).toISOString(),
            changedFiles: []
          }
        ]}
        notes={[]}
        inboxItems={[]}
        completedTasks={[]}
        now={new Date(2026, 5, 16, 12)}
      />
    );

    expect(screen.getByText("Only commits so far")).toBeInTheDocument();
    expect(
      screen.getByText("Work reviews, notes, and captures will appear here as you use Desclop.")
    ).toBeInTheDocument();
    expect(screen.getByText("Wire timeline")).toBeInTheDocument();
  });
});
