import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timelineEngine";

describe("buildTimeline", () => {
  const timestamp = (year: number, monthIndex: number, day: number, hour: number, minute: number) =>
    new Date(year, monthIndex, day, hour, minute).toISOString();

  it("groups timeline events by local day with readable labels and separated metadata", () => {
    const now = new Date(2026, 5, 16, 12);
    const timeline = buildTimeline(
      {
        workEntries: [
          {
            id: "w1",
            projectId: "p1",
            taskId: "t1",
            source: "manual",
            startedAt: null,
            endedAt: null,
            durationSeconds: 754,
            done: "Reviewed timeline hierarchy",
            remains: "",
            nextStep: "",
            createdAt: timestamp(2026, 5, 16, 9, 30)
          }
        ],
        commits: [
          {
            sha: "abcdef1234567890",
            projectId: "p1",
            branch: "main",
            message: "fix: timeline grouping",
            authorName: "Clyde",
            committedAt: timestamp(2026, 5, 16, 10, 45),
            changedFiles: ["timelineEngine.ts"]
          }
        ],
        notes: [
          {
            id: "n1",
            projectId: "p1",
            taskId: null,
            body: "Check yesterday grouping\nKeep metadata separate",
            createdAt: timestamp(2026, 5, 15, 16, 20)
          }
        ],
        inboxItems: [],
        completedTasks: []
      },
      now
    );

    expect(timeline.summary).toBe("1 commit · 1 work review · 1 note");
    expect(timeline.sections.map((section) => section.label)).toEqual([
      "Today, Jun 16",
      "Yesterday, Jun 15"
    ]);
    expect(timeline.sections.map((section) => section.id)).toEqual(["2026-06-16", "2026-06-15"]);
    expect(timeline.sections[0].items.map((item) => item.typeLabel)).toEqual(["Commit", "Work review"]);
    expect(timeline.sections[0].items[0]).toMatchObject({
      title: "fix: timeline grouping",
      metadata: "abcdef1 · main",
      changedFiles: ["timelineEngine.ts"],
      changedFilesLabel: "1 file changed"
    });
    expect(timeline.sections[0].items[0].time).toMatch(/^\d{2}:\d{2}$/);
    expect(timeline.sections[0].items[1]).toMatchObject({
      title: "Reviewed timeline hierarchy",
      metadata: "Manual review · 13 min"
    });
    expect(timeline.sections[1].items[0]).toMatchObject({
      typeLabel: "Note",
      title: "Check yesterday grouping",
      metadata: "Project note"
    });
  });

  it("paginates sorted items before regrouping visible timeline sections", () => {
    const commits = Array.from({ length: 26 }, (_, index) => ({
      sha: `abcdef${String(index).padStart(3, "0")}`,
      projectId: "p1",
      branch: "main",
      message: `commit ${index + 1}`,
      authorName: "Clyde",
      committedAt: timestamp(2026, 5, index < 25 ? 16 : 15, 12, 25 - index),
      changedFiles: [`file-${index + 1}.ts`]
    }));

    const firstPage = buildTimeline(
      {
        workEntries: [],
        commits,
        notes: [],
        inboxItems: [],
        completedTasks: []
      },
      new Date(2026, 5, 16, 13),
      { page: 1 }
    );
    const secondPage = buildTimeline(
      {
        workEntries: [],
        commits,
        notes: [],
        inboxItems: [],
        completedTasks: []
      },
      new Date(2026, 5, 16, 13),
      { page: 2 }
    );

    expect(firstPage.pagination).toEqual({
      page: 1,
      pageCount: 2,
      pageSize: 25,
      totalItems: 26,
      hasPreviousPage: false,
      hasNextPage: true
    });
    expect(firstPage.sections.map((section) => section.label)).toEqual(["Today, Jun 16"]);
    expect(firstPage.sections.flatMap((section) => section.items).map((item) => item.title)).toHaveLength(25);
    expect(secondPage.pagination).toMatchObject({
      page: 2,
      hasPreviousPage: true,
      hasNextPage: false
    });
    expect(secondPage.sections.map((section) => section.label)).toEqual(["Yesterday, Jun 15"]);
    expect(secondPage.sections[0].items[0]).toMatchObject({
      title: "commit 26",
      changedFiles: ["file-26.ts"],
      changedFilesLabel: "1 file changed"
    });
  });

  it("returns sparse state copy when only commits exist", () => {
    const timeline = buildTimeline({
      workEntries: [],
      commits: [
        {
          sha: "abcdef1234567890",
          projectId: "p1",
          branch: "main",
          message: "chore: initialize history",
          authorName: "Clyde",
          committedAt: timestamp(2026, 5, 16, 10, 45),
          changedFiles: []
        }
      ],
      notes: [],
      inboxItems: [],
      completedTasks: []
    });

    expect(timeline.sparseState).toEqual({
      title: "Only commits so far",
      body: "Work reviews, notes, and captures will appear here as you use Desclop."
    });
  });

  it("maps every work entry source to readable metadata with an optional duration", () => {
    const sourceLabels = [
      ["focus", "Focus session"],
      ["manual", "Manual review"],
      ["status_change", "Status change"],
      ["note", "Note"],
      ["inbox", "Inbox"],
      ["git_recovery", "Git recovery"]
    ] as const;

    for (const [source, label] of sourceLabels) {
      for (const [durationSeconds, expectedMetadata] of [
        [null, label],
        [125, `${label} · 2 min`]
      ] as const) {
        const timeline = buildTimeline({
          workEntries: [
            {
              id: `${source}-${durationSeconds ?? "none"}`,
              projectId: "p1",
              taskId: "t1",
              source,
              startedAt: null,
              endedAt: null,
              durationSeconds,
              done: "Reviewed timeline",
              remains: "",
              nextStep: "",
              createdAt: timestamp(2026, 5, 16, 9, 30)
            }
          ],
          commits: [],
          notes: [],
          inboxItems: [],
          completedTasks: []
        });

        expect(timeline.sections[0].items[0].metadata).toBe(expectedMetadata);
      }
    }
  });

  it("preserves note text when the first line is empty", () => {
    const body = "\nPreserve the original note";
    const timeline = buildTimeline({
      workEntries: [],
      commits: [],
      notes: [
        {
          id: "n1",
          projectId: "p1",
          taskId: null,
          body,
          createdAt: timestamp(2026, 5, 16, 10, 45)
        }
      ],
      inboxItems: [],
      completedTasks: []
    });

    expect(timeline.sections[0].items[0].title).toBe(body);
  });

  it("treats completed tasks as activity for sparse state", () => {
    const completedTask = {
      id: "t1",
      projectId: "p1",
      stageId: "s1",
      title: "Ship timeline",
      description: "",
      status: "done" as const,
      priority: null,
      dueDate: null,
      nextStep: "",
      position: 1,
      completedAt: timestamp(2026, 5, 16, 9, 15)
    };
    const completedTaskOnly = buildTimeline({
      workEntries: [],
      commits: [],
      notes: [],
      inboxItems: [],
      completedTasks: [completedTask]
    });
    const commitAndCompletedTask = buildTimeline({
      workEntries: [],
      commits: [
        {
          sha: "abcdef1234567890",
          projectId: "p1",
          branch: "main",
          message: "chore: finish timeline",
          authorName: "Clyde",
          committedAt: timestamp(2026, 5, 16, 10, 45),
          changedFiles: []
        }
      ],
      notes: [],
      inboxItems: [],
      completedTasks: [completedTask]
    });

    expect(completedTaskOnly.sparseState).toBeNull();
    expect(commitAndCompletedTask.sparseState).toBeNull();
  });

  it("ignores completed tasks without a valid activity timestamp", () => {
    const productionTask = {
      id: "t1",
      projectId: "p1",
      stageId: "s1",
      title: "Production-shaped completed task",
      description: "",
      status: "done" as const,
      priority: null,
      dueDate: null,
      nextStep: "",
      position: 1
    };
    const invalidTimestampTask = {
      ...productionTask,
      id: "t2",
      title: "Invalid timestamp task",
      completedAt: "not-a-date",
      updatedAt: ""
    };
    const emptyTimeline = buildTimeline({
      workEntries: [],
      commits: [],
      notes: [],
      inboxItems: [],
      completedTasks: [productionTask, invalidTimestampTask]
    });
    const commitsOnlyTimeline = buildTimeline({
      workEntries: [],
      commits: [
        {
          sha: "abcdef1234567890",
          projectId: "p1",
          branch: "main",
          message: "chore: finish timeline",
          authorName: "Clyde",
          committedAt: timestamp(2026, 5, 16, 10, 45),
          changedFiles: []
        }
      ],
      notes: [],
      inboxItems: [],
      completedTasks: [productionTask, invalidTimestampTask]
    });

    expect(emptyTimeline.sections).toEqual([]);
    expect(emptyTimeline.sparseState?.title).toBe("No timeline events yet");
    expect(commitsOnlyTimeline.sections.flatMap((section) => section.items)).toHaveLength(1);
    expect(commitsOnlyTimeline.sparseState?.title).toBe("Only commits so far");
  });

  it("uses DOM-safe local-date section ids and includes tasks with a valid updated timestamp", () => {
    const timeline = buildTimeline(
      {
        workEntries: [],
        commits: [],
        notes: [],
        inboxItems: [
          {
            id: "i1",
            projectId: "p1",
            taskId: "t1",
            body: "Follow up on timeline\nAdd polish",
            kind: "task_candidate",
            status: "open",
            createdAt: timestamp(2026, 5, 16, 11, 30),
            updatedAt: timestamp(2026, 5, 16, 11, 30)
          }
        ],
        completedTasks: [
          {
            id: "t1",
            projectId: "p1",
            stageId: "s1",
            title: "Finish timeline",
            description: "",
            status: "done",
            priority: null,
            dueDate: null,
            nextStep: "",
            position: 1,
            completedAt: timestamp(2026, 5, 16, 9, 15)
          },
          {
            id: "t2",
            projectId: "p1",
            stageId: "s1",
            title: "Updated cleanup",
            description: "",
            status: "done",
            priority: null,
            dueDate: null,
            nextStep: "",
            position: 2,
            updatedAt: timestamp(2026, 5, 15, 14, 30)
          }
        ]
      },
      new Date(2026, 5, 16, 12)
    );

    expect(timeline.sections.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "2026-06-16", label: "Today, Jun 16" },
      { id: "2026-06-15", label: "Yesterday, Jun 15" }
    ]);
    expect(timeline.sections[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capture",
          typeLabel: "Capture",
          title: "Follow up on timeline",
          metadata: "Task · Follow-up"
        }),
        expect.objectContaining({
          kind: "task",
          typeLabel: "Task",
          title: "Finish timeline",
          metadata: "Completed"
        })
      ])
    );
    expect(timeline.sections[1].items[0]).toMatchObject({
      kind: "task",
      title: "Updated cleanup",
      metadata: "Completed",
      time: expect.stringMatching(/^\d{2}:\d{2}$/)
    });
  });
});
