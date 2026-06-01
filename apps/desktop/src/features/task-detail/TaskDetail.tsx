import { type FormEvent, useEffect, useState } from "react";
import type {
  ChecklistItem,
  GitCommit,
  InboxKind,
  InboxItem,
  Note,
  Task,
  TaskStatus,
  WorkEntry
} from "../../shared/domain/types";
import type { FocusModeKind } from "../focus-mode/focusTimer";
import { InboxCapture } from "../inbox/InboxCapture";

export interface StartFocusInput {
  taskId: string;
  mode: FocusModeKind;
  timeboxMinutes: number | null;
}

export interface TaskDetailProps {
  task: Task;
  checklist: ChecklistItem[];
  notes: Note[];
  linkedCommits: GitCommit[];
  availableTasks: Task[];
  workEntries: WorkEntry[];
  inboxItems: InboxItem[];
  onStatusChange: (taskId: string, status: TaskStatus) => void | Promise<void>;
  onChecklistToggle: (itemId: string, completed: boolean) => void | Promise<void>;
  onNoteAdd: (taskId: string, body: string) => void | Promise<void>;
  onNextStepSave: (taskId: string, nextStep: string) => void | Promise<void>;
  onStartFocus: (input: StartFocusInput) => void | Promise<void>;
  onCommitUnlink: (commitSha: string, taskId: string) => void | Promise<void>;
  onCommitMove: (commitSha: string, fromTaskId: string, toTaskId: string) => void | Promise<void>;
  onCaptureInbox?: (input: { body: string; kind: InboxKind }) => void | Promise<void>;
  onStartManualWorkReview?: () => void;
}

const taskStatuses: TaskStatus[] = ["todo", "active", "blocked", "done"];
const taskStatusLabels: Record<TaskStatus, string> = {
  todo: "To do",
  active: "Active",
  blocked: "Blocked",
  done: "Done"
};

export function TaskDetail({
  task,
  checklist,
  notes,
  linkedCommits,
  availableTasks,
  workEntries,
  inboxItems,
  onStatusChange,
  onChecklistToggle,
  onNoteAdd,
  onNextStepSave,
  onStartFocus,
  onCommitUnlink,
  onCommitMove,
  onCaptureInbox,
  onStartManualWorkReview
}: TaskDetailProps) {
  const [noteBody, setNoteBody] = useState("");
  const [nextStep, setNextStep] = useState(task.nextStep);
  const [timeboxMinutes, setTimeboxMinutes] = useState(25);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    setNextStep(task.nextStep);
  }, [task.id, task.nextStep]);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    const trimmedBody = noteBody.trim();
    if (!trimmedBody) {
      return;
    }

    await onNoteAdd(task.id, trimmedBody);
    setNoteBody("");
  }

  async function saveNextStep(event: FormEvent) {
    event.preventDefault();
    await onNextStepSave(task.id, nextStep.trim());
  }

  function startAmbientFocus() {
    onStartFocus({ taskId: task.id, mode: "ambient", timeboxMinutes: null });
  }

  function startTimeboxFocus() {
    const roundedMinutes = Math.floor(timeboxMinutes);
    onStartFocus({
      taskId: task.id,
      mode: "timebox",
      timeboxMinutes: Number.isFinite(roundedMinutes) ? Math.max(1, roundedMinutes) : 1
    });
  }

  function shortSha(commitSha: string) {
    return commitSha.slice(0, 7);
  }

  function selectedMoveTarget(commitSha: string) {
    return moveTargets[commitSha] ?? availableTasks[0]?.id ?? "";
  }

  async function moveCommit(commitSha: string) {
    const toTaskId = selectedMoveTarget(commitSha);
    if (!toTaskId) {
      return;
    }

    await onCommitMove(commitSha, task.id, toTaskId);
  }

  return (
    <section className="stack" aria-labelledby={`${task.id}-detail-title`}>
      <header className="stack">
        <div>
          <h2 id={`${task.id}-detail-title`}>{task.title}</h2>
          {task.description ? <p>{task.description}</p> : null}
        </div>
        <div className="stack">
          <button type="button" onClick={startAmbientFocus}>
            Start ambient focus
          </button>
          {onStartManualWorkReview ? (
            <button type="button" onClick={onStartManualWorkReview}>
              Add manual work review
            </button>
          ) : null}
          <label htmlFor={`${task.id}-timebox-minutes`}>
            Timebox minutes
            <input
              id={`${task.id}-timebox-minutes`}
              min={1}
              type="number"
              value={timeboxMinutes}
              onChange={(event) => setTimeboxMinutes(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={startTimeboxFocus}>
            Start timebox focus
          </button>
        </div>
      </header>

      <label htmlFor={`${task.id}-status`}>
        Task status
        <select
          id={`${task.id}-status`}
          value={task.status}
          onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}
        >
          {taskStatuses.map((status) => (
            <option key={status} value={status}>
              {taskStatusLabels[status]}
            </option>
          ))}
        </select>
      </label>

      <section className="stack" aria-labelledby={`${task.id}-checklist-title`}>
        <h3 id={`${task.id}-checklist-title`}>Checklist</h3>
        {checklist.length > 0 ? (
          checklist.map((item) => (
            <label className="inline-field" key={item.id}>
              <input
                type="checkbox"
                checked={item.completed}
                onChange={(event) => onChecklistToggle(item.id, event.target.checked)}
              />
              {item.title}
            </label>
          ))
        ) : (
          <p>No checklist items.</p>
        )}
      </section>

      <form className="stack" onSubmit={addNote}>
        <label htmlFor={`${task.id}-quick-note`}>
          Quick note
          <textarea
            id={`${task.id}-quick-note`}
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
          />
        </label>
        <button type="submit">Add note</button>
      </form>

      <form className="stack" onSubmit={saveNextStep}>
        <label htmlFor={`${task.id}-next-step`}>
          Next step
          <textarea
            id={`${task.id}-next-step`}
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
          />
        </label>
        <button type="submit">Save next step</button>
      </form>

      <section className="stack" aria-labelledby={`${task.id}-notes-title`}>
        <h3 id={`${task.id}-notes-title`}>Notes</h3>
        {notes.length > 0 ? (
          <ul>
            {notes.map((note) => (
              <li key={note.id}>{note.body}</li>
            ))}
          </ul>
        ) : (
          <p>No notes yet.</p>
        )}
      </section>

      <section className="stack" aria-labelledby={`${task.id}-context-title`}>
        <h3 id={`${task.id}-context-title`}>Context</h3>
        <p>{linkedCommits.length} linked commits</p>
        {linkedCommits.length > 0 ? (
          <ul>
            {linkedCommits.map((commit) => {
              const displaySha = shortSha(commit.sha);
              const moveTarget = selectedMoveTarget(commit.sha);

              return (
                <li className="stack" key={commit.sha}>
                  <div>
                    <strong>{commit.message}</strong>
                    <p>
                      {displaySha} on {commit.branch} at {commit.committedAt}
                    </p>
                  </div>
                  {commit.changedFiles.length > 0 ? (
                    <ul>
                      {commit.changedFiles.map((changedFile) => (
                        <li key={changedFile}>{changedFile}</li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onCommitUnlink(commit.sha, task.id)}
                  >
                    Unlink {displaySha}
                  </button>
                  <label htmlFor={`${task.id}-${commit.sha}-move-target`}>
                    Move {displaySha} to task
                    <select
                      id={`${task.id}-${commit.sha}-move-target`}
                      value={moveTarget}
                      onChange={(event) =>
                        setMoveTargets((targets) => ({
                          ...targets,
                          [commit.sha]: event.target.value
                        }))
                      }
                    >
                      {availableTasks.map((availableTask) => (
                        <option key={availableTask.id} value={availableTask.id}>
                          {availableTask.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!moveTarget}
                    onClick={() => void moveCommit(commit.sha)}
                  >
                    Move {displaySha}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <p>{workEntries.length} work entries</p>
        <p>{inboxItems.length} inbox items</p>
        {onCaptureInbox ? <InboxCapture onCapture={onCaptureInbox} /> : null}
      </section>
    </section>
  );
}
