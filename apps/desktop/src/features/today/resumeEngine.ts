import { GitCommit, InboxItem, Stage, Task, WorkEntry } from "../../shared/domain/types";

export interface ResumeBriefView {
  heading: string;
  primaryTaskTitle: string;
  stageTitle: string;
  latestNote: string;
  nextStep: string;
  facts: string[];
  nextTasks: Task[];
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

  return {
    heading: "Continue where you left off",
    primaryTaskTitle: input.task?.title ?? "No active task",
    stageTitle: input.stage?.title ?? "No current stage",
    latestNote: input.latestNote,
    nextStep: input.task?.nextStep || "Choose the next concrete step before you stop.",
    facts,
    nextTasks: input.nextTasks.slice(0, 3)
  };
}
