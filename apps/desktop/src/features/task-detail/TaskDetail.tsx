import { type FormEvent, useEffect, useRef, useState } from "react";
import type {
  ChecklistItem,
  GitCommit,
  InboxItem,
  Note,
  Task,
  TaskStatus,
  WorkEntry
} from "../../shared/domain/types";
import {
  ActionBar,
  Button,
  InlineAlert,
  ScreenHeader,
  SectionHeader,
  SelectField,
  Surface,
  TextArea,
  TextField
} from "../../shared/ui";
import type { FocusModeKind } from "../focus-mode/focusTimer";

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
  onStartManualWorkReview
}: TaskDetailProps) {
  const [noteBody, setNoteBody] = useState("");
  const [nextStep, setNextStep] = useState(task.nextStep);
  const [timeboxMinutes, setTimeboxMinutes] = useState("25");
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [expandedCommits, setExpandedCommits] = useState<Record<string, boolean>>({});
  const [pendingCommitActions, setPendingCommitActions] = useState<
    Record<string, "remove" | "move" | undefined>
  >({});
  const [commitActionErrors, setCommitActionErrors] = useState<
    Record<string, string | undefined>
  >({});
  const commitIdentitySignature = `${task.id}:${linkedCommits
    .map((commit) => commit.sha)
    .join(",")}`;
  const commitIdentitySignatureRef = useRef(commitIdentitySignature);
  commitIdentitySignatureRef.current = commitIdentitySignature;

  useEffect(() => {
    setNextStep(task.nextStep);
  }, [task.id, task.nextStep]);

  useEffect(() => {
    setExpandedCommits({});
    setMoveTargets({});
    setPendingCommitActions({});
    setCommitActionErrors({});
  }, [commitIdentitySignature]);

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

  function startFocus() {
    const roundedMinutes = Math.floor(Number(timeboxMinutes));
    const hasTimebox = Number.isFinite(roundedMinutes) && roundedMinutes > 0;
    onStartFocus({
      taskId: task.id,
      mode: hasTimebox ? "timebox" : "ambient",
      timeboxMinutes: hasTimebox ? roundedMinutes : null
    });
  }

  function shortSha(commitSha: string) {
    return commitSha.slice(0, 7);
  }

  function selectedMoveTarget(commitSha: string) {
    const targetId = moveTargets[commitSha] ?? "";
    return availableTasks.some((availableTask) => availableTask.id === targetId)
      ? targetId
      : "";
  }

  function fileCountLabel(count: number) {
    return `${count} ${count === 1 ? "file" : "files"} changed`;
  }

  function formatCommitTime(timestamp: string) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  async function moveCommit(commitSha: string) {
    const operationIdentitySignature = commitIdentitySignature;
    const toTaskId = selectedMoveTarget(commitSha);
    if (
      !toTaskId ||
      pendingCommitActions[commitSha] ||
      !availableTasks.some((availableTask) => availableTask.id === toTaskId)
    ) {
      return;
    }

    setPendingCommitActions((actions) => ({ ...actions, [commitSha]: "move" }));
    setCommitActionErrors((errors) => ({ ...errors, [commitSha]: undefined }));
    try {
      await onCommitMove(commitSha, task.id, toTaskId);
    } catch {
      if (commitIdentitySignatureRef.current !== operationIdentitySignature) {
        return;
      }
      setCommitActionErrors((errors) => ({
        ...errors,
        [commitSha]: "Could not move commit. Try again."
      }));
    } finally {
      if (commitIdentitySignatureRef.current === operationIdentitySignature) {
        setPendingCommitActions((actions) => ({ ...actions, [commitSha]: undefined }));
      }
    }
  }

  async function removeCommit(commitSha: string) {
    const operationIdentitySignature = commitIdentitySignature;
    if (pendingCommitActions[commitSha]) {
      return;
    }

    setPendingCommitActions((actions) => ({ ...actions, [commitSha]: "remove" }));
    setCommitActionErrors((errors) => ({ ...errors, [commitSha]: undefined }));
    try {
      await onCommitUnlink(commitSha, task.id);
    } catch {
      if (commitIdentitySignatureRef.current !== operationIdentitySignature) {
        return;
      }
      setCommitActionErrors((errors) => ({
        ...errors,
        [commitSha]: "Could not remove commit. Try again."
      }));
    } finally {
      if (commitIdentitySignatureRef.current === operationIdentitySignature) {
        setPendingCommitActions((actions) => ({ ...actions, [commitSha]: undefined }));
      }
    }
  }

  return (
    <section className="task-detail stack">
      <ScreenHeader
        eyebrow={stageTitle ? `${stageTitle} task` : "Task detail"}
        title={task.title}
        description={task.description || undefined}
      />

      <Surface className="task-workbench-header">
        <form className="task-workbench-header__next-step" onSubmit={saveNextStep}>
          <TextArea
            id={`${task.id}-next-step`}
            label="Next action"
            hint="What is the next small action needed to continue this task?"
            value={nextStep}
            onChange={(event) => setNextStep(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            Save next action
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
            <TextField
              className="task-workbench-header__timebox"
              id={`${task.id}-timebox-minutes`}
              label="Timebox"
              min={1}
              type="number"
              value={timeboxMinutes}
              onChange={(event) => setTimeboxMinutes(event.target.value)}
            />
            <Button onClick={startFocus}>Start focus</Button>
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
            <SectionHeader
              title="Work reviews"
              action={
                onStartManualWorkReview ? (
                  <Button variant="secondary" onClick={onStartManualWorkReview}>
                    Add work review
                  </Button>
                ) : undefined
              }
            />
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
              <p className="task-workbench__empty">
                Work you log manually or from focus sessions will appear here.
              </p>
            )}
          </Surface>
        </main>

        <aside className="task-workbench__rail stack">
          <Surface ariaLabel="Linked commits">
            <SectionHeader title="Linked commits" />
            <p className="task-workbench__empty">{linkedCommits.length} linked commits</p>
            {linkedCommits.length > 0 ? (
              <ul className="task-linked-commits">
                {linkedCommits.map((commit) => {
                  const displaySha = shortSha(commit.sha);
                  const moveTarget = selectedMoveTarget(commit.sha);
                  const isExpanded = expandedCommits[commit.sha] ?? false;
                  const pendingAction = pendingCommitActions[commit.sha];
                  const detailsId = `${task.id}-${commit.sha}-commit-details`;

                  return (
                    <li className="task-linked-commit" key={commit.sha}>
                      <div className="task-linked-commit__summary">
                        <strong>{commit.message}</strong>
                        <p>
                          {displaySha} · {commit.branch} ·{" "}
                          {fileCountLabel(commit.changedFiles.length)}
                        </p>
                        <time dateTime={commit.committedAt}>
                          {formatCommitTime(commit.committedAt)}
                        </time>
                      </div>
                      <ActionBar>
                        <Button
                          variant="secondary"
                          aria-label={`${
                            isExpanded ? "Hide commit details" : "Show commit details"
                          } for ${commit.sha}`}
                          aria-controls={detailsId}
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedCommits((commits) => ({
                              ...commits,
                              [commit.sha]: !isExpanded
                            }))
                          }
                        >
                          {isExpanded ? "Hide commit details" : "Show commit details"}
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`Remove ${commit.sha} from task`}
                          disabled={Boolean(pendingAction)}
                          onClick={() => removeCommit(commit.sha)}
                        >
                          Remove from task
                        </Button>
                      </ActionBar>
                      {commitActionErrors[commit.sha] ? (
                        <InlineAlert tone="error">
                          {commitActionErrors[commit.sha]}
                        </InlineAlert>
                      ) : null}
                      {isExpanded ? (
                        <div className="task-linked-commit__details" id={detailsId}>
                          {commit.changedFiles.length > 0 ? (
                            <ul className="task-linked-commit__files">
                              {commit.changedFiles.map((changedFile) => (
                                <li key={changedFile}>{changedFile}</li>
                              ))}
                            </ul>
                          ) : null}
                          <ActionBar>
                            <SelectField
                              id={`${task.id}-${commit.sha}-move-target`}
                              label={`Move ${displaySha} to task`}
                              value={moveTarget}
                              disabled={Boolean(pendingAction)}
                              onChange={(event) =>
                                setMoveTargets((targets) => ({
                                  ...targets,
                                  [commit.sha]: event.target.value
                                }))
                              }
                            >
                              <option value="">Select task</option>
                              {availableTasks.map((availableTask) => (
                                <option key={availableTask.id} value={availableTask.id}>
                                  {availableTask.title}
                                </option>
                              ))}
                            </SelectField>
                            <Button
                              variant="secondary"
                              aria-label={`Move ${commit.sha} to task`}
                              disabled={!moveTarget || Boolean(pendingAction)}
                              onClick={() => moveCommit(commit.sha)}
                            >
                              Move to task
                            </Button>
                          </ActionBar>
                        </div>
                      ) : null}
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
