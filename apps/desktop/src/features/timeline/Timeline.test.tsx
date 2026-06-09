import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("renders a readable review screen from project history", () => {
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
            durationSeconds: null,
            done: "Reviewed schema",
            remains: "",
            nextStep: "Run tests",
            createdAt: "2026-05-20T10:00:00Z"
          }
        ]}
        commits={[
          {
            sha: "abc123",
            projectId: "p1",
            branch: "main",
            message: "Wire timeline",
            authorName: "Clyde",
            committedAt: "2026-05-20T10:05:00Z",
            changedFiles: []
          }
        ]}
        notes={[]}
        inboxItems={[]}
        completedTasks={[]}
      />
    );

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("1 work entry, 1 commit, 0 notes")).toBeInTheDocument();
    expect(screen.getByText("Reviewed schema")).toBeInTheDocument();
    expect(screen.getByText("Wire timeline")).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "No timeline facts yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Capture notes or save a work review to build project memory.")
    ).toBeInTheDocument();
  });
});
