import { type FormEvent, useEffect, useState } from "react";
import type {
  ChecklistItem,
  GitCommit,
  InboxItem,
  Note,
  Task,
  TaskStatus,
  WorkEntry
} from "../../shared/domain/types";

export interface TaskDetailProps {
  task: Task;
  checklist: ChecklistItem[];
  notes: Note[];
  linkedCommits: GitCommit[];
  workEntries: WorkEntry[];
  inboxItems: InboxItem[];
  onStatusChange: (taskId: string, status: TaskStatus) => void | Promise<void>;
  onChecklistToggle: (itemId: string, completed: boolean) => void | Promise<void>;
  onNoteAdd: (taskId: string, body: string) => void | Promise<void>;
  onNextStepSave: (taskId: string, nextStep: string) => void | Promise<void>;
  onStartFocus: (taskId: string) => void | Promise<void>;
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
  workEntries,
  inboxItems,
  onStatusChange,
  onChecklistToggle,
  onNoteAdd,
  onNextStepSave,
  onStartFocus
}: TaskDetailProps) {
  const [noteBody, setNoteBody] = useState("");
  const [nextStep, setNextStep] = useState(task.nextStep);

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

  return (
    <section className="stack" aria-labelledby={`${task.id}-detail-title`}>
      <header className="stack">
        <div>
          <h2 id={`${task.id}-detail-title`}>{task.title}</h2>
          {task.description ? <p>{task.description}</p> : null}
        </div>
        <button type="button" onClick={() => onStartFocus(task.id)}>
          Start Focus Mode
        </button>
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
        <p>{workEntries.length} work entries</p>
        <p>{inboxItems.length} inbox items</p>
      </section>
    </section>
  );
}
