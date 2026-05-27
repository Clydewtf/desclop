export type FocusModeKind = "ambient" | "timebox";

export function getFocusTimerState(input: {
  mode: FocusModeKind;
  startedAtMs: number;
  nowMs: number;
  timeboxMinutes: number | null;
}) {
  const elapsedSeconds = Math.max(0, Math.floor((input.nowMs - input.startedAtMs) / 1000));
  if (input.mode === "ambient" || input.timeboxMinutes === null) {
    return { elapsedSeconds, remainingSeconds: null, finished: false };
  }

  const totalSeconds = input.timeboxMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

  return {
    elapsedSeconds,
    remainingSeconds,
    finished: remainingSeconds === 0
  };
}
