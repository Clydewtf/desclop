import { ChecklistItem, Stage, Task } from "../../shared/domain/types";

export function exportPlanMarkdown(input: {
  projectName: string;
  stages: Stage[];
  tasks: Task[];
  checklistItems: ChecklistItem[];
}) {
  const lines = [`# ${input.projectName} Plan`, ""];

  input.stages
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((stage) => {
      lines.push(`## ${stage.title}`, "");
      input.tasks
        .filter((task) => task.stageId === stage.id)
        .sort((a, b) => a.position - b.position)
        .forEach((task) => {
          const checked = task.status === "done" ? "x" : " ";
          lines.push(`- [${checked}] ${task.title}`);
          input.checklistItems
            .filter((item) => item.taskId === task.id)
            .sort((a, b) => a.position - b.position)
            .forEach((item) => {
              lines.push(`  - [${item.completed ? "x" : " "}] ${item.title}`);
            });
          if (task.nextStep) {
            lines.push(`  - Next step: ${task.nextStep}`);
          }
        });
      lines.push("");
    });

  return `${lines.join("\n").trimEnd()}\n`;
}
