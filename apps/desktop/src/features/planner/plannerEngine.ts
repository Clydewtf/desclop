import type { ChecklistItem, Plan, Stage, Task } from "../../shared/domain/types";

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

export interface PlanFrame {
  plan: Plan;
  collapsed: boolean;
  stageFrames: PlannerFrame[];
  progress: PlannerFrame["progress"];
}

export function buildPlanFrames(
  plans: Plan[] | undefined,
  stages: Stage[],
  tasks: Task[],
  checklistItems: ChecklistItem[],
  activeTaskId: string | null = null
): PlanFrame[] {
  const knownPlans = plans && plans.length > 0 ? [...plans].sort(byPosition) : legacyPlans(stages);

  return knownPlans.map((plan) => {
    const planStages = stages.filter((stage) =>
      stage.planId ? stage.planId === plan.id : plan.id === "legacy-plan"
    );
    const stageFrames = buildPlannerFrames(planStages, tasks, checklistItems, activeTaskId);
    const progress = sumProgress(stageFrames);
    const collapsed =
      stageFrames.length > 0 && stageFrames.every((frame) => frame.stage.status === "completed");

    return {
      plan,
      collapsed,
      stageFrames,
      progress
    };
  });
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

function legacyPlans(stages: Stage[]): Plan[] {
  if (stages.length === 0) {
    return [];
  }

  return [
    {
      id: "legacy-plan",
      projectId: stages[0].projectId,
      title: "Imported plan",
      position: 0
    }
  ];
}

function sumProgress(frames: PlannerFrame[]): PlannerFrame["progress"] {
  const completedTasks = frames.reduce((sum, frame) => sum + frame.progress.completedTasks, 0);
  const totalTasks = frames.reduce((sum, frame) => sum + frame.progress.totalTasks, 0);
  const completedChecklist = frames.reduce(
    (sum, frame) => sum + frame.progress.completedChecklist,
    0
  );
  const totalChecklist = frames.reduce((sum, frame) => sum + frame.progress.totalChecklist, 0);
  const percent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return {
    completedTasks,
    totalTasks,
    completedChecklist,
    totalChecklist,
    percent,
    tasksLabel: `${completedTasks}/${totalTasks} tasks`,
    checklistLabel: totalChecklist > 0 ? `${completedChecklist}/${totalChecklist} checklist` : null
  };
}

function byPosition<T extends { position: number }>(left: T, right: T) {
  return left.position - right.position;
}
