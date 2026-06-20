import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("renders project history grouped by local date", () => {
    const workTimestamp = new Date(2026, 5, 16, 10).toISOString();
    const commitTimestamp = new Date(2026, 5, 16, 10, 5).toISOString();

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
        notes={[]}
        inboxItems={[]}
        completedTasks={[]}
        now={new Date(2026, 5, 16, 12)}
      />
    );

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today, Jun 16" })).toBeInTheDocument();
    expect(screen.getByText("Commit")).toBeInTheDocument();
    expect(screen.getByText("Work review")).toBeInTheDocument();
    expect(screen.getByText("abcdef1 · main · 1 file changed")).toBeInTheDocument();
    expect(screen.getByText("Reviewed schema")).toBeInTheDocument();
    expect(screen.getByText("Wire timeline")).toBeInTheDocument();
    expect(screen.queryByText(workTimestamp)).not.toBeInTheDocument();
    expect(screen.queryByText(commitTimestamp)).not.toBeInTheDocument();
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
