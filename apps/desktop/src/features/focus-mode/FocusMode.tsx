import { useState } from "react";
import type { ChecklistItem, InboxKind, Task } from "../../shared/domain/types";
import { Button, InlineAlert, SectionHeader, Surface, TextArea } from "../../shared/ui";
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
  onCaptureInbox: (input: { body: string; kind: InboxKind }) => void | Promise<void>;
  onNoteAdd: (body: string) => void | Promise<void>;
  onChecklistToggle: (itemId: string, completed: boolean) => void | Promise<void>;
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
      <header className="focus-mode__header">
        <div className="focus-mode__task">
          <h1 id="focus-title">{props.task.title}</h1>
          {props.task.nextStep ? <p>{props.task.nextStep}</p> : null}
        </div>
        <div className="focus-mode__timer" aria-label="Focus timer">
          <span>{formatSeconds(timer.elapsedSeconds)}</span>
          {timer.remainingSeconds !== null ? (
            <small>{formatSeconds(timer.remainingSeconds)} remaining</small>
          ) : null}
        </div>
      </header>

      <div className="focus-mode__grid">
        <Surface ariaLabel="Focus checklist" className="focus-mode__checklist">
          <SectionHeader title="Checklist" />
          {props.checklist.length > 0 ? (
            <div className="focus-mode__checklist-items">
              {props.checklist.map((item) => (
                <label className="inline-field" key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) => props.onChecklistToggle(item.id, event.target.checked)}
                  />
                  {item.title}
                </label>
              ))}
            </div>
          ) : (
            <p className="focus-mode__empty">No checklist items.</p>
          )}
        </Surface>

        <Surface ariaLabel="Focus notes and capture" className="focus-mode__notes">
          <SectionHeader title="Notes and capture" />
          {noteError ? <InlineAlert tone="error">Could not save quick note.</InlineAlert> : null}
          <TextArea
            id="focus-quick-note"
            label="Quick note"
            value={quickNote}
            onChange={(event) => setQuickNote(event.target.value)}
            disabled={finishing}
          />
          <InboxCapture onCapture={props.onCaptureInbox} />
          <Button type="button" onClick={finishSession} disabled={finishing}>
            {finishing ? "Finishing focus session" : "Finish focus session"}
          </Button>
        </Surface>
      </div>
    </section>
  );
}
