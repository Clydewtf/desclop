type ParsedTaskStatus = "todo" | "done";

export const CANONICAL_MARKDOWN_TEMPLATE = `# Название плана

## Этап 1 — Основа
- [ ] Создать локальное хранилище
  - [ ] Добавить миграцию
  - [ ] Проверить репозиторий задач

## Этап 2 — Resume flow
- [ ] Собрать экран Today
  - [ ] Указать следующее конкретное действие`;

export interface ParsedChecklistItem {
  title: string;
  description: string;
  completed: boolean;
  position: number;
}

export interface ParsedTask {
  title: string;
  description: string;
  status: ParsedTaskStatus;
  checklist: ParsedChecklistItem[];
  position: number;
}

export interface ParsedStage {
  title: string;
  description: string;
  tasks: ParsedTask[];
  position: number;
}

export interface ParsedMarkdownPlan {
  planTitle: string | null;
  stages: ParsedStage[];
  warnings: string[];
}

export function parsedTaskCount(parsed: ParsedMarkdownPlan) {
  return parsed.stages.reduce((count, stage) => count + stage.tasks.length, 0);
}

export function parsedChecklistCount(parsed: ParsedMarkdownPlan) {
  return parsed.stages.reduce(
    (count, stage) =>
      count + stage.tasks.reduce((taskCount, task) => taskCount + task.checklist.length, 0),
    0
  );
}

export function canImportParsedPlan(parsed: ParsedMarkdownPlan) {
  return parsed.stages.length > 0 && parsedTaskCount(parsed) > 0;
}

const planHeadingPattern = /^#\s+(.+)$/;
const stageHeadingPattern = /^(#{2,3})\s+(.+)$/;
const checkboxPattern = /^(\s*)-\s+\[( |x|X)\]\s+(.+)$/;
const stageDescriptionPattern = /^>\s+(.+)$/;
const taskDescriptionPattern = /^ {2}>\s+(.+)$/;
const checklistDescriptionPattern = /^ {4}>\s+(.+)$/;

type DescriptionTarget =
  | { kind: "stage"; stage: ParsedStage }
  | { kind: "task"; task: ParsedTask }
  | { kind: "checklist"; item: ParsedChecklistItem };

function appendDescription(current: string, nextLine: string) {
  return current ? `${current}\n${nextLine}` : nextLine;
}

function warning(lineNumber: number, message: string) {
  return `Line ${lineNumber}: ${message}`;
}

export function parseMarkdownPlan(markdown: string): ParsedMarkdownPlan {
  let planTitle: string | null = null;
  const stages: ParsedStage[] = [];
  const warnings: string[] = [];
  let lastDescriptionTarget: DescriptionTarget | null = null;

  markdown.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.trim()) {
      lastDescriptionTarget = null;
      return;
    }

    const planHeading = line.match(planHeadingPattern);
    if (planHeading) {
      if (planTitle) {
        warnings.push(warning(lineNumber, "only one plan title is supported; this line was not imported."));
      } else {
        planTitle = planHeading[1].trim();
      }
      lastDescriptionTarget = null;
      return;
    }

    const heading = line.match(stageHeadingPattern);
    if (heading) {
      const stage: ParsedStage = {
        title: heading[2].trim(),
        description: "",
        tasks: [],
        position: stages.length
      };
      stages.push(stage);
      lastDescriptionTarget = { kind: "stage", stage };
      return;
    }

    const stageDescription = line.match(stageDescriptionPattern);
    if (stageDescription) {
      if (lastDescriptionTarget?.kind === "stage") {
        lastDescriptionTarget.stage.description = appendDescription(
          lastDescriptionTarget.stage.description,
          stageDescription[1].trim()
        );
      } else {
        warnings.push(
          warning(lineNumber, "stage descriptions must follow a stage heading and were not imported.")
        );
      }
      return;
    }

    const taskDescription = line.match(taskDescriptionPattern);
    if (taskDescription) {
      if (lastDescriptionTarget?.kind === "task") {
        lastDescriptionTarget.task.description = appendDescription(
          lastDescriptionTarget.task.description,
          taskDescription[1].trim()
        );
      } else {
        warnings.push(
          warning(lineNumber, "task descriptions must follow a top-level task and were not imported.")
        );
      }
      return;
    }

    const checklistDescription = line.match(checklistDescriptionPattern);
    if (checklistDescription) {
      if (lastDescriptionTarget?.kind === "checklist") {
        lastDescriptionTarget.item.description = appendDescription(
          lastDescriptionTarget.item.description,
          checklistDescription[1].trim()
        );
      } else {
        warnings.push(
          warning(
            lineNumber,
            "checklist descriptions must follow a checklist item and were not imported."
          )
        );
      }
      return;
    }

    const checkbox = line.match(checkboxPattern);
    if (!checkbox) {
      warnings.push(
        warning(lineNumber, "this Markdown line is not part of the supported plan syntax and was not imported.")
      );
      lastDescriptionTarget = null;
      return;
    }

    const indent = checkbox[1].length;
    const completed = checkbox[2].toLowerCase() === "x";
    const title = checkbox[3].trim();
    const stage = stages.at(-1);

    if (indent !== 0 && indent !== 2) {
      warnings.push(
        warning(
          lineNumber,
          "checkbox indentation must be zero spaces for a task or exactly two spaces for a checklist item; this line was not imported."
        )
      );
      lastDescriptionTarget = null;
      return;
    }

    if (!stage) {
      warnings.push(
        warning(lineNumber, "task checkbox appears before any stage heading and was not imported.")
      );
      lastDescriptionTarget = null;
      return;
    }

    if (indent === 0) {
      const task: ParsedTask = {
        title,
        description: "",
        status: completed ? "done" : "todo",
        checklist: [],
        position: stage.tasks.length
      };
      stage.tasks.push(task);
      lastDescriptionTarget = { kind: "task", task };
      return;
    }

    const task = stage.tasks.at(-1);
    if (!task) {
      warnings.push(
        warning(lineNumber, "checklist checkbox appears before any task and was not imported.")
      );
      lastDescriptionTarget = null;
      return;
    }

    const item: ParsedChecklistItem = {
      title,
      description: "",
      completed,
      position: task.checklist.length
    };
    task.checklist.push(item);
    lastDescriptionTarget = { kind: "checklist", item };
  });

  return { planTitle, stages, warnings };
}
