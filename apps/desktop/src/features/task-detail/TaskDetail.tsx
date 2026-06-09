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
import {
  ActionBar,
  Button,
  ScreenHeader,
  SectionHeader,
  SelectField,
  Surface,
  TextArea,
  TextField
} from "../../shared/ui";
import type { FocusModeKind } from "../focus-mode/focusTimer";
import { InboxCapture } from "../inbox/InboxCapture";

export interface StartFocusInput {
  taskId: string;
  mode: FocusModeKind;
  timeboxMinutes: number | null;
}

export interface TaskDetailProps {
  task: Task;
  stageTitle?: string;
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
  stageTitle,
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
    <section className="task-detail stack">
      <ScreenHeader
        eyebrow={stageTitle ? `${stageTitle} task` : "Task detail"}
        title={task.title}
        description={task.description || undefined}
        actions={<Button onClick={startAmbientFocus}>Start focus</Button>}
      />

      <Surface className="task-workbench-header">
        <form className="task-workbench-header__next-step" onSubmit={saveNextStep}>
          <TextArea
            id={`${task.id}-next-step`}
            label="Next step"
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            Save next step
          </Button>
        </form>

        <div className="task-workbench-header__controls">
          <SelectField
            className="task-workbench-header__status"
            id={`${task.id}-status`}
            label="Task status"
            value={task.status}
            onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}
          >
            {taskStatuses.map((status) => (
              <option key={status} value={status}>
                {taskStatusLabels[status]}
              </option>
            ))}
          </SelectField>

          <ActionBar>
            {onStartManualWorkReview ? (
              <Button variant="secondary" onClick={onStartManualWorkReview}>
                Add manual work review
              </Button>
            ) : null}
            <TextField
              className="task-workbench-header__timebox"
              id={`${task.id}-timebox-minutes`}
              label="Timebox minutes"
              min={1}
              type="number"
              value={timeboxMinutes}
              onChange={(event) => setTimeboxMinutes(Number(event.target.value))}
            />
            <Button variant="secondary" onClick={startTimeboxFocus}>
              Start timebox
            </Button>
          </ActionBar>
        </div>
      </Surface>

      <div className="task-workbench">
        <main className="task-workbench__main stack">
          <Surface ariaLabel="Checklist">
            <SectionHeader title="Checklist" />
            {checklist.length > 0 ? (
              <div className="task-checklist">
                {checklist.map((item) => (
                  <label className="inline-field" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={(event) => onChecklistToggle(item.id, event.target.checked)}
                    />
                    {item.title}
                  </label>
                ))}
              </div>
            ) : (
              <p className="task-workbench__empty">No checklist items.</p>
            )}
          </Surface>

          <Surface ariaLabel="Notes">
            <SectionHeader title="Notes" />
            <form className="task-note-form" onSubmit={addNote}>
              <TextArea
                id={`${task.id}-quick-note`}
                label="Quick note"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
              />
              <Button type="submit" variant="secondary">
                Add note
              </Button>
            </form>
            {notes.length > 0 ? (
              <ul className="task-notes">
                {notes.map((note) => (
                  <li key={note.id}>{note.body}</li>
                ))}
              </ul>
            ) : (
              <p className="task-workbench__empty">No notes yet.</p>
            )}
          </Surface>

          <Surface ariaLabel="Work reviews">
            <SectionHeader title="Work reviews" />
            <p className="task-workbench__empty">{workEntries.length} work entries</p>
            {workEntries.length > 0 ? (
              <ul className="task-work-reviews">
                {workEntries.map((entry) => (
                  <li className="task-work-review" key={entry.id}>
                    <strong>{entry.done || "Work reviewed"}</strong>
                    {entry.remains ? <p>Remains: {entry.remains}</p> : null}
                    {entry.nextStep ? <p>Next: {entry.nextStep}</p> : null}
                    <span>{entry.createdAt}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="task-workbench__empty">No work reviews yet.</p>
            )}
          </Surface>
        </main>

        <aside className="task-workbench__rail stack">
          <Surface ariaLabel="Quick capture">
            <SectionHeader title="Quick capture" />
            {onCaptureInbox ? (
              <InboxCapture onCapture={onCaptureInbox} />
            ) : (
              <p className="task-workbench__empty">Capture is unavailable.</p>
            )}
          </Surface>

          <Surface ariaLabel="Linked commits">
            <SectionHeader title="Linked commits" />
            <p className="task-workbench__empty">{linkedCommits.length} linked commits</p>
            {linkedCommits.length > 0 ? (
              <ul className="task-linked-commits">
                {linkedCommits.map((commit) => {
                  const displaySha = shortSha(commit.sha);
                  const moveTarget = selectedMoveTarget(commit.sha);

                  return (
                    <li className="task-linked-commit" key={commit.sha}>
                      <div>
                        <strong>{commit.message}</strong>
                        <p>
                          {displaySha} on {commit.branch} at {commit.committedAt}
                        </p>
                      </div>
                      {commit.changedFiles.length > 0 ? (
                        <ul className="task-linked-commit__files">
                          {commit.changedFiles.map((changedFile) => (
                            <li key={changedFile}>{changedFile}</li>
                          ))}
                        </ul>
                      ) : null}
                      <ActionBar>
                        <Button
                          variant="secondary"
                          onClick={() => void onCommitUnlink(commit.sha, task.id)}
                        >
                          Unlink {displaySha}
                        </Button>
                        <SelectField
                          id={`${task.id}-${commit.sha}-move-target`}
                          label={`Move ${displaySha} to task`}
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
                        </SelectField>
                        <Button
                          variant="secondary"
                          disabled={!moveTarget}
                          onClick={() => void moveCommit(commit.sha)}
                        >
                          Move {displaySha}
                        </Button>
                      </ActionBar>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="task-workbench__empty">No linked commits.</p>
            )}
          </Surface>

          <Surface ariaLabel="Inbox items">
            <SectionHeader title="Inbox items" />
            <p className="task-workbench__empty">{inboxItems.length} inbox items</p>
            {inboxItems.length > 0 ? (
              <ul className="task-inbox-items">
                {inboxItems.map((item) => (
                  <li key={item.id}>
                    <strong>{item.kind}</strong>
                    <p>{item.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="task-workbench__empty">No inbox items.</p>
            )}
          </Surface>
        </aside>
      </div>
    </section>
  );
}
