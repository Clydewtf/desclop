import type {
  ChecklistItem,
  GitCommit,
  Note,
  Plan,
  Project,
  Stage,
  Task,
  WorkEntry
} from "../../shared/domain/types";

export const CONTEXT_EXPORT_VERSION = "desclop-ai-context/v1";
export const CONTEXT_EXPORT_TITLE = "Desclop AI context";
export const CONTEXT_EXPORT_WORK_REVIEW_LIMIT = 5;

export const CONTEXT_EXPORT_FIELD_IDS = [
  "project",
  "plan",
  "task",
  "next_action",
  "work_reviews",
  "notes",
  "related_commits"
] as const;

export type ContextExportFieldId = (typeof CONTEXT_EXPORT_FIELD_IDS)[number];

export interface ContextExportInput {
  project: Project;
  plan: Plan | null;
  stage: Stage | null;
  task: Task | null;
  checklistItems: ChecklistItem[];
  workEntries: WorkEntry[];
  notes: Note[];
  linkedCommits: GitCommit[];
}

export interface ContextExportField {
  id: ContextExportFieldId;
  title: string;
  preview: string;
  defaultIncluded: boolean;
}

export interface ContextExportCompositionField {
  title: string;
  preview: string;
  included: boolean;
}

const fieldTitles: Record<ContextExportFieldId, string> = {
  project: "Project",
  plan: "Plan",
  task: "Task",
  next_action: "Next action",
  work_reviews: "Recent work reviews",
  notes: "Notes",
  related_commits: "Related commits"
};

export function buildContextExportFields(input: ContextExportInput): ContextExportField[] {
  const taskChecklist = input.task
    ? input.checklistItems
        .filter((item) => item.taskId === input.task?.id)
        .slice()
        .sort(comparePosition)
    : [];
  const workEntries = input.workEntries
    .slice()
    .sort((left, right) => compareTimestampDesc(left.createdAt, right.createdAt, left.id, right.id));
  const recentWorkEntries = workEntries.slice(0, CONTEXT_EXPORT_WORK_REVIEW_LIMIT);
  const notes = input.notes
    .slice()
    .sort((left, right) => compareTimestampDesc(left.createdAt, right.createdAt, left.id, right.id));
  const linkedCommits = input.linkedCommits
    .slice()
    .sort((left, right) => compareTimestampDesc(left.committedAt, right.committedAt, left.sha, right.sha));

  return [
    {
      id: "project",
      title: fieldTitles.project,
      preview: formatProject(input.project),
      defaultIncluded: Boolean(input.project.name.trim())
    },
    {
      id: "plan",
      title: fieldTitles.plan,
      preview: formatPlan(input.plan, input.stage),
      defaultIncluded: input.plan !== null
    },
    {
      id: "task",
      title: fieldTitles.task,
      preview: formatTask(input.task, taskChecklist),
      defaultIncluded: input.task !== null
    },
    {
      id: "next_action",
      title: fieldTitles.next_action,
      preview: input.task ? formatOptionalText(input.task.nextStep) : "No task selected.",
      defaultIncluded: Boolean(input.task?.nextStep.trim())
    },
    {
      id: "work_reviews",
      title: fieldTitles.work_reviews,
      preview: formatWorkReviews(recentWorkEntries, workEntries.length),
      defaultIncluded: recentWorkEntries.length > 0
    },
    {
      id: "notes",
      title: fieldTitles.notes,
      preview: formatNotes(notes),
      defaultIncluded: notes.length > 0
    },
    {
      id: "related_commits",
      title: fieldTitles.related_commits,
      preview: formatCommits(linkedCommits),
      defaultIncluded: linkedCommits.length > 0
    }
  ];
}

export function composeContextExport(fields: ContextExportCompositionField[]) {
  const sections = fields
    .filter((field) => field.included)
    .map((field) => `## ${field.title}\n${field.preview.trim()}`);

  return [`# ${CONTEXT_EXPORT_TITLE}`, ...sections].join("\n\n").trimEnd() + "\n";
}

export function findDefaultContextTaskId(input: {
  project: Pick<Project, "activeTaskId">;
  resumeTaskId: string | null;
  plans: Plan[];
  stages: Stage[];
  tasks: Task[];
}) {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const activeTask = input.project.activeTaskId
    ? taskById.get(input.project.activeTaskId) ?? null
    : null;
  if (activeTask && activeTask.status !== "done") {
    return activeTask.id;
  }

  const resumeTask = input.resumeTaskId ? taskById.get(input.resumeTaskId) ?? null : null;
  if (resumeTask && resumeTask.status !== "done") {
    return resumeTask.id;
  }

  const orderedTasks = orderTasks(input.tasks, input.plans, input.stages);
  return orderedTasks.find((task) => task.status !== "done")?.id ?? orderedTasks[0]?.id ?? null;
}

export function findPlanIdForTask(taskId: string | null, tasks: Task[], stages: Stage[]) {
  const task = taskId ? tasks.find((candidate) => candidate.id === taskId) : null;
  const stage = task ? stages.find((candidate) => candidate.id === task.stageId) : null;
  return stage?.planId ?? null;
}

export function orderTasks(tasks: Task[], plans: Plan[], stages: Stage[]) {
  const planPositions = new Map(plans.map((plan) => [plan.id, plan.position]));
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));

  return tasks.slice().sort((left, right) => {
    const leftStage = stagesById.get(left.stageId);
    const rightStage = stagesById.get(right.stageId);
    const planDifference =
      (planPositions.get(leftStage?.planId ?? "") ?? Number.MAX_SAFE_INTEGER) -
      (planPositions.get(rightStage?.planId ?? "") ?? Number.MAX_SAFE_INTEGER);
    const stageDifference = (leftStage?.position ?? Number.MAX_SAFE_INTEGER) -
      (rightStage?.position ?? Number.MAX_SAFE_INTEGER);

    return planDifference || stageDifference || left.position - right.position || left.id.localeCompare(right.id);
  });
}

function formatProject(project: Project) {
  return `Name: ${formatInlineText(project.name)}`;
}

function formatPlan(plan: Plan | null, stage: Stage | null) {
  if (!plan) {
    return "No plan selected.";
  }

  return [
    `Plan: ${formatInlineText(plan.title)}`,
    `Stage: ${stage ? formatInlineText(stage.title) : "Not selected"}`,
    "Stage context:",
    stage?.description.trim() || "Not set"
  ].join("\n");
}

function formatTask(task: Task | null, checklistItems: ChecklistItem[]) {
  if (!task) {
    return "No task selected.";
  }

  const lines = [
    `Title: ${formatInlineText(task.title)}`,
    `Status: ${formatInlineText(task.status)}`,
    `Priority: ${task.priority ? formatInlineText(task.priority) : "Not set"}`,
    `Due date: ${task.dueDate ? formatInlineText(task.dueDate) : "Not set"}`,
    "Description:",
    task.description.trim() || "Not set",
    "Checklist:"
  ];

  if (checklistItems.length === 0) {
    lines.push("No checklist items.");
  } else {
    checklistItems.forEach((item) => {
      lines.push(`- [${item.completed ? "x" : " "}] ${formatInlineText(item.title)}`);
      if (item.description?.trim()) {
        lines.push(`  Description: ${item.description.trim()}`);
      }
    });
  }

  return lines.join("\n");
}

function formatWorkReviews(entries: WorkEntry[], totalCount: number) {
  if (entries.length === 0) {
    return "No work reviews recorded.";
  }

  const lines: string[] = [];
  if (totalCount > entries.length) {
    lines.push(`Showing ${entries.length} latest of ${totalCount} work reviews.`, "");
  }

  entries.forEach((entry, index) => {
    if (index > 0) {
      lines.push("");
    }
    lines.push(
      `### ${formatDate(entry.createdAt)} · ${formatInlineText(entry.source)}`,
      `- Done: ${formatOptionalText(entry.done)}`,
      `- Remains: ${formatOptionalText(entry.remains)}`,
      `- Next action: ${formatOptionalText(entry.nextStep)}`
    );
  });

  return lines.join("\n");
}

function formatNotes(notes: Note[]) {
  if (notes.length === 0) {
    return "No notes recorded.";
  }

  return notes
    .map((note) => `- ${formatDate(note.createdAt)}: ${formatMultilineText(note.body)}`)
    .join("\n");
}

function formatCommits(commits: GitCommit[]) {
  if (commits.length === 0) {
    return "No related commits recorded.";
  }

  return commits
    .map((commit) => {
      const lines = [
        `### \`${formatInlineText(commit.sha)}\` — ${formatInlineText(commit.message)}`,
        `- Branch: ${formatOptionalText(commit.branch)}`,
        `- Author: ${formatOptionalText(commit.authorName)}`,
        `- Committed: ${formatDate(commit.committedAt)}`,
        "- Changed files:"
      ];

      if (commit.changedFiles.length === 0) {
        lines.push("  None recorded.");
      } else {
        commit.changedFiles.forEach((file) => lines.push(`  - ${formatInlineText(file)}`));
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

function formatInlineText(value: string) {
  return value.replace(/\s+/g, " ").trim() || "Not set";
}

function formatOptionalText(value: string) {
  return value.trim() || "Not set";
}

function formatMultilineText(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "Not set";
  }
  return normalized.replace(/\r?\n/g, "\n  ");
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown date";
  }
  return value.slice(0, 10) || "Unknown date";
}

function comparePosition(left: { position: number; id: string }, right: { position: number; id: string }) {
  return left.position - right.position || left.id.localeCompare(right.id);
}

function compareTimestampDesc(
  leftTimestamp: string,
  rightTimestamp: string,
  leftId: string,
  rightId: string
) {
  const left = Date.parse(leftTimestamp);
  const right = Date.parse(rightTimestamp);
  const leftValue = Number.isNaN(left) ? Number.NEGATIVE_INFINITY : left;
  const rightValue = Number.isNaN(right) ? Number.NEGATIVE_INFINITY : right;

  return rightValue - leftValue || rightId.localeCompare(leftId);
}
