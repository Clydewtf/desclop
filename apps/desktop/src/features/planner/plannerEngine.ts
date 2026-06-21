import type { ChecklistItem, Stage, Task } from "../../shared/domain/types";

export interface PlannerFrame {
  stage: Stage;
  collapsed: boolean;
  recommendedTaskId: string | null;
  tasks: Array<Task & { checklist: ChecklistItem[] }>;
  progress: {
    completedTasks: number;
    totalTasks: number;
    completedChecklist: number;
    totalChecklist: number;
    percent: number;
    tasksLabel: string;
    checklistLabel: string | null;
  };
}

export function buildPlannerFrames(
  stages: Stage[],
  tasks: Task[],
  checklistItems: ChecklistItem[],
  activeTaskId: string | null = null
): PlannerFrame[] {
  return [...stages]
    .sort(byPosition)
    .map((stage) => {
      const stageTasks = tasks
        .filter((task) => task.stageId === stage.id)
        .sort(byPosition)
        .map((task) => ({
          ...task,
          checklist: checklistItems
            .filter((item) => item.taskId === task.id)
            .sort(byPosition)
        }));
      const checklist = stageTasks.flatMap((taskFrame) => taskFrame.checklist);
      const completedTasks = stageTasks.filter((task) => task.status === "done").length;
      const totalTasks = stageTasks.length;
      const completedChecklist = checklist.filter((item) => item.completed).length;
      const totalChecklist = checklist.length;
      const percent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

      return {
        stage,
        collapsed: stage.status === "completed",
        recommendedTaskId:
          stageTasks.find((task) => task.id === activeTaskId)?.id ??
          stageTasks.find((task) => task.status === "active")?.id ??
          null,
        tasks: stageTasks,
        progress: {
          completedTasks,
          totalTasks,
          completedChecklist,
          totalChecklist,
          percent,
          tasksLabel: `${completedTasks}/${totalTasks} tasks`,
          checklistLabel: totalChecklist > 0 ? `${completedChecklist}/${totalChecklist} checklist` : null
        }
      };
    });
}

function byPosition<T extends { position: number }>(left: T, right: T) {
  return left.position - right.position;
}
