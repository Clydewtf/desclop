import { CommitLinkMode } from "../../shared/domain/types";

interface Input {
  committedAt: string;
  focusInterval: { taskId?: string; startedAt: string; endedAt: string } | null;
  activeTaskId: string | null;
}

export function chooseCommitLinkMode(input: Input): { taskId: string; linkMode: CommitLinkMode } | null {
  if (input.focusInterval && (input.focusInterval.taskId || input.activeTaskId)) {
    const committedAt = Date.parse(input.committedAt);
    const startedAt = Date.parse(input.focusInterval.startedAt);
    const endedAt = Date.parse(input.focusInterval.endedAt);
    if (committedAt >= startedAt && committedAt <= endedAt) {
      return {
        taskId: input.focusInterval.taskId ?? input.activeTaskId!,
        linkMode: "focus_interval"
      };
    }
  }

  if (input.activeTaskId) {
    return { taskId: input.activeTaskId, linkMode: "active_task" };
  }

  return null;
}
