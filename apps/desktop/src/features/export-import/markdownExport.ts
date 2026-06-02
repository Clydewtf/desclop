import { ChecklistItem, Stage, Task } from "../../shared/domain/types";

export function exportPlanMarkdown(input: {
  projectName: string;
  stages: Stage[];
  tasks: Task[];
  checklistItems: ChecklistItem[];
}) {
  const lines = [`# ${oneLine(input.projectName)} Plan`, ""];

  input.stages
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((stage) => {
      lines.push(`## ${oneLine(stage.title)}`, "");
      input.tasks
        .filter((task) => task.stageId === stage.id)
        .sort((a, b) => a.position - b.position)
        .forEach((task) => {
          const checked = task.status === "done" ? "x" : " ";
          lines.push(`- [${checked}] ${oneLine(task.title)}`);
          input.checklistItems
            .filter((item) => item.taskId === task.id)
            .sort((a, b) => a.position - b.position)
            .forEach((item) => {
              lines.push(
                `  - [${item.completed ? "x" : " "}] ${oneLine(item.title)}`
              );
            });
          if (task.nextStep) {
            lines.push(`  - Next step: ${oneLine(task.nextStep)}`);
          }
        });
      lines.push("");
    });

  return `${lines.join("\n").trimEnd()}\n`;
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
