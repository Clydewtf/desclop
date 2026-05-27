import { useState } from "react";
import type { ChecklistItem, InboxKind, Task } from "../../shared/domain/types";
import { InboxCapture } from "../inbox/InboxCapture";
import { getFocusTimerState, type FocusModeKind } from "./focusTimer";

interface FocusModeProps {
  task: Task;
  checklist: ChecklistItem[];
  mode: FocusModeKind;
  startedAtMs: number;
  nowMs: number;
  timeboxMinutes: number | null;
  onFinish: (input: { elapsedSeconds: number }) => void;
  onCaptureInbox: (input: { body: string; kind: InboxKind }) => void;
  onNoteAdd: (body: string) => void | Promise<void>;
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function FocusMode(props: FocusModeProps) {
  const [quickNote, setQuickNote] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const timer = getFocusTimerState(props);

  async function finishSession() {
    if (finishing) {
      return;
    }

    const trimmedNote = quickNote.trim();
    setFinishing(true);
    setNoteError(null);
    try {
      if (trimmedNote) {
        await props.onNoteAdd(trimmedNote);
        setQuickNote("");
      }
      props.onFinish({ elapsedSeconds: timer.elapsedSeconds });
    } catch {
      setNoteError("Could not save quick note.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <section className="focus-mode" aria-labelledby="focus-title">
      <div className="focus-animation" aria-hidden="true" />
      <h1 id="focus-title">{props.task.title}</h1>
      <p>{formatSeconds(timer.elapsedSeconds)}</p>
      {timer.remainingSeconds !== null ? <p>{formatSeconds(timer.remainingSeconds)} remaining</p> : null}
      <section aria-label="Focus checklist">
        {props.checklist.map((item) => (
          <label className="inline-field" key={item.id}>
            <input type="checkbox" defaultChecked={item.completed} />
            {item.title}
          </label>
        ))}
      </section>
      {noteError ? <p role="alert">{noteError}</p> : null}
      <label>
        Quick note
        <textarea
          value={quickNote}
          onChange={(event) => setQuickNote(event.target.value)}
          disabled={finishing}
        />
      </label>
      <InboxCapture onCapture={props.onCaptureInbox} />
      <button type="button" onClick={finishSession} disabled={finishing}>
        {finishing ? "Finishing focus session" : "Finish focus session"}
      </button>
    </section>
  );
}
