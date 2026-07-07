type ParsedTaskStatus = "todo" | "done";

export interface ParsedChecklistItem {
  title: string;
  completed: boolean;
  position: number;
}

export interface ParsedTask {
  title: string;
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

const planHeadingPattern = /^#\s+(.+)$/;
const headingPattern = /^(#{2,3})\s+(.+)$/;
const checkboxPattern = /^(\s*)-\s+\[( |x|X)\]\s+(.+)$/;

export function parseMarkdownPlan(markdown: string): ParsedMarkdownPlan {
  let planTitle: string | null = null;
  const stages: ParsedStage[] = [];
  const warnings: string[] = [];

  markdown.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const planHeading = line.match(planHeadingPattern);
    if (planHeading) {
      planTitle ??= planHeading[1].trim();
      return;
    }

    const heading = line.match(headingPattern);
    if (heading) {
      stages.push({
        title: heading[2].trim(),
        description: "",
        tasks: [],
        position: stages.length
      });
      return;
    }

    const checkbox = line.match(checkboxPattern);
    if (!checkbox) {
      return;
    }

    const indent = checkbox[1].length;
    const completed = checkbox[2].toLowerCase() === "x";
    const title = checkbox[3].trim();
    const stage = stages.at(-1);

    if (!stage) {
      warnings.push(
        `Line ${lineNumber}: task checkbox appears before any stage heading and was not imported.`
      );
      return;
    }

    if (indent === 0) {
      stage.tasks.push({
        title,
        status: completed ? "done" : "todo",
        checklist: [],
        position: stage.tasks.length
      });
      return;
    }

    const task = stage.tasks.at(-1);
    if (!task) {
      warnings.push(
        `Line ${lineNumber}: checklist checkbox appears before any task and was not imported.`
      );
      return;
    }

    task.checklist.push({
      title,
      completed,
      position: task.checklist.length
    });
  });

  return { planTitle, stages, warnings };
}
