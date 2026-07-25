import { ChecklistItem, Plan, Stage, Task } from "../../shared/domain/types";

export interface MarkdownPlanExport {
  id: string;
  title: string;
  markdown: string;
}

export function exportPlanMarkdown(input: {
  projectName: string;
  planTitle?: string;
  planId?: string;
  stages: Stage[];
  tasks: Task[];
  checklistItems: ChecklistItem[];
}) {
  const heading = input.planTitle
    ? `# ${oneLine(input.projectName)} — ${oneLine(input.planTitle)}`
    : `# ${oneLine(input.projectName)} Plan`;
  const lines = [heading, ""];

  input.stages
    .slice()
    .filter((stage) => !input.planId || stage.planId === input.planId)
    .sort((a, b) => a.position - b.position)
    .forEach((stage) => {
      lines.push(`## ${oneLine(stage.title)}`);
      if (stage.description) {
        lines.push(`> ${oneLine(stage.description)}`);
      }
      lines.push("");
      input.tasks
        .filter((task) => task.stageId === stage.id)
        .sort((a, b) => a.position - b.position)
        .forEach((task) => {
          const checked = task.status === "done" ? "x" : " ";
          lines.push(`- [${checked}] ${oneLine(task.title)}`);
          if (task.description) {
            lines.push(`  > ${oneLine(task.description)}`);
          }
          input.checklistItems
            .filter((item) => item.taskId === task.id)
            .sort((a, b) => a.position - b.position)
            .forEach((item) => {
              lines.push(
                `  - [${item.completed ? "x" : " "}] ${oneLine(item.title)}`
              );
              if (item.description) {
                lines.push(`    > ${oneLine(item.description)}`);
              }
            });
          if (task.nextStep) {
            lines.push(`  - Next step: ${oneLine(task.nextStep)}`);
          }
        });
      lines.push("");
    });

  return `${lines.join("\n").trimEnd()}\n`;
}

export function exportProjectMarkdowns(input: {
  projectName: string;
  plans: Plan[];
  stages: Stage[];
  tasks: Task[];
  checklistItems: ChecklistItem[];
}): MarkdownPlanExport[] {
  const plans = input.plans.slice().sort((left, right) => left.position - right.position);

  if (!plans.length) {
    return [
      {
        id: "project-plan",
        title: "Project plan",
        markdown: exportPlanMarkdown(input)
      }
    ];
  }

  return plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    markdown: exportPlanMarkdown({
      ...input,
      planId: plan.id,
      planTitle: plan.title
    })
  }));
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
