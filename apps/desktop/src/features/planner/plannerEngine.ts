import type { ChecklistItem, Stage, Task } from "../../shared/domain/types";

export interface PlannerFrame {
  stage: Stage;
  collapsed: boolean;
  tasks: Array<Task & { checklist: ChecklistItem[] }>;
  progress: {
    completedTasks: number;
    totalTasks: number;
    completedChecklist: number;
    totalChecklist: number;
  };
}

export function buildPlannerFrames(
  stages: Stage[],
  tasks: Task[],
  checklistItems: ChecklistItem[]
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

      return {
        stage,
        collapsed: stage.status === "completed",
        tasks: stageTasks,
        progress: {
          completedTasks: stageTasks.filter((task) => task.status === "done").length,
          totalTasks: stageTasks.length,
          completedChecklist: checklist.filter((item) => item.completed).length,
          totalChecklist: checklist.length
        }
      };
    });
}

function byPosition<T extends { position: number }>(left: T, right: T) {
  return left.position - right.position;
}
