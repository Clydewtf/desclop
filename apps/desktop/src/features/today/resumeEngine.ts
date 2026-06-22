import { GitCommit, InboxItem, Stage, Task, WorkEntry } from "../../shared/domain/types";

export type TodayState = "ready" | "no-project" | "no-plan" | "no-active-task" | "missing-next-step";

export interface ResumeBriefView {
  state: TodayState;
  heading: string;
  primaryTaskTitle: string;
  stageTitle: string;
  latestNote: string;
  nextStep: string;
  facts: string[];
  nextTasks: Task[];
  primaryActionLabel: string;
}

interface ResumeInput {
  task: Task | null;
  stage: Stage | null;
  latestNote: string;
  precomputedFacts?: string[];
  commits: GitCommit[];
  workEntries: WorkEntry[];
  inboxItems: InboxItem[];
  nextTasks: Task[];
  hasPlan: boolean;
}

export function buildResumeBriefView(input: ResumeInput): ResumeBriefView {
  const branch = input.commits[0]?.branch;
  const facts = input.precomputedFacts ?? [
    input.commits.length > 0
      ? `${input.commits.length} recent ${input.commits.length === 1 ? "commit" : "commits"} on ${branch}`
      : "",
    input.workEntries.length > 0 ? `${input.workEntries.length} recent work entries` : "",
    input.inboxItems.length > 0 ? `${input.inboxItems.length} open inbox captures` : ""
  ].filter(Boolean);
  const state: TodayState = !input.hasPlan
    ? "no-plan"
    : !input.task
      ? "no-active-task"
      : !input.task.nextStep.trim()
        ? "missing-next-step"
        : "ready";
  const primaryActionLabels: Record<TodayState, string> = {
    ready: "Continue task",
    "no-project": "Create project",
    "no-plan": "Import a plan",
    "no-active-task": "Pick a task from Plan",
    "missing-next-step": "Set next action"
  };
  const primaryTaskTitles: Record<TodayState, string> = {
    ready: input.task?.title ?? "No active task",
    "no-project": "No project selected",
    "no-plan": "No plan imported",
    "no-active-task": "No active task",
    "missing-next-step": input.task?.title ?? "No active task"
  };
  const nextStep =
    state === "no-plan"
      ? "Import a Markdown plan to start using Today."
      : state === "no-active-task"
        ? "Choose an active task from your plan to make Today resumable."
        : state === "missing-next-step"
          ? "Set the next concrete action before continuing."
          : input.task?.nextStep || "Choose the next concrete step before you stop.";

  return {
    state,
    heading: "Continue where you left off",
    primaryTaskTitle: primaryTaskTitles[state],
    stageTitle: input.stage?.title ?? "No current stage",
    latestNote: input.latestNote,
    nextStep,
    facts,
    nextTasks: input.nextTasks.slice(0, 3),
    primaryActionLabel: primaryActionLabels[state]
  };
}
