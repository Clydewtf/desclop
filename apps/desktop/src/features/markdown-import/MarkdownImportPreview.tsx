import {
  canImportParsedPlan,
  parsedChecklistCount,
  parsedTaskCount,
  type ParsedMarkdownPlan
} from "./markdownParser";
import { Button, EmptyState, InlineAlert, Surface } from "../../shared/ui";

interface MarkdownImportPreviewProps {
  parsed: ParsedMarkdownPlan | null;
  fallbackPlanTitle?: string;
  importing?: boolean;
  onImport: () => void;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function MarkdownImportPreview({
  parsed,
  fallbackPlanTitle = "Plan 1",
  importing = false,
  onImport
}: MarkdownImportPreviewProps) {
  if (!parsed) {
    return (
      <section
        id="markdown-import-preview"
        className="stack markdown-import-preview"
        aria-labelledby="preview-title"
      >
        <h2 id="preview-title">Import preview</h2>
        <Surface ariaLabel="Preview instructions">
          <EmptyState
            title="Nothing to preview yet"
            body="Enter or paste a Markdown plan above, then click Preview import. Counts, warnings, and the import action will appear here."
          />
        </Surface>
      </section>
    );
  }

  const planTitle = parsed.planTitle ?? fallbackPlanTitle;
  const taskCount = parsedTaskCount(parsed);
  const checklistCount = parsedChecklistCount(parsed);
  const canImport = canImportParsedPlan(parsed);

  return (
    <section
      id="markdown-import-preview"
      className="stack markdown-import-preview"
      aria-labelledby="preview-title"
    >
      <h2 id="preview-title">Import preview</h2>
      <div className="markdown-preview__summary">
        <div>
          <span className="markdown-preview__label">New plan</span>
          <p className="markdown-preview__plan-title">{planTitle}</p>
        </div>
        <p className="markdown-preview__append-note">
          Import adds a new plan. Existing plans, tasks, notes, and history will not be replaced.
        </p>
      </div>

      <dl className="markdown-preview__counts" aria-label="Import summary">
        <div>
          <dt>Stages</dt>
          <dd>{pluralize(parsed.stages.length, "stage")}</dd>
        </div>
        <div>
          <dt>Tasks</dt>
          <dd>{pluralize(taskCount, "task")}</dd>
        </div>
        <div>
          <dt>Checklist items</dt>
          <dd>{pluralize(checklistCount, "checklist item", "checklist items")}</dd>
        </div>
      </dl>

      {parsed.warnings.length > 0 ? (
        <InlineAlert tone="warning">
          <strong>{pluralize(parsed.warnings.length, "warning")}</strong>
          <ul className="markdown-preview__warnings">
            {parsed.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </InlineAlert>
      ) : null}

      {!canImport ? (
        <InlineAlert tone="warning">
          Add at least one task before importing. A plan without tasks cannot be created.
        </InlineAlert>
      ) : null}

      {parsed.stages.length > 0 ? (
        <div className="stage-list">
          {parsed.stages.map((stage) => (
            <article className="stage-frame" key={`${stage.position}-${stage.title}`}>
              <div className="markdown-preview__stage-heading">
                <h3>{stage.title}</h3>
                {stage.description ? (
                  <details className="markdown-preview__details">
                    <summary>Stage context</summary>
                    <p>{stage.description}</p>
                  </details>
                ) : null}
              </div>
              {stage.tasks.length > 0 ? (
                <div className="markdown-preview__tasks">
                  {stage.tasks.map((task) => (
                    <div className="task-row" key={`${task.position}-${task.title}`}>
                      <div className="task-row__content">
                        <div className="task-row__title">
                          <span>{task.title}</span>
                          {task.status === "done" ? <small>Completed</small> : null}
                        </div>
                        {task.description ? (
                          <details className="markdown-preview__details">
                            <summary>Task details</summary>
                            <p>{task.description}</p>
                          </details>
                        ) : null}
                        {task.checklist.length > 0 ? (
                          <ul className="markdown-preview__checklist">
                            {task.checklist.map((item) => (
                              <li key={`${item.position}-${item.title}`}>
                                <span>
                                  {item.completed ? "☑" : "☐"} {item.title}
                                </span>
                                {item.description ? (
                                  <details className="markdown-preview__details">
                                    <summary>Checklist details</summary>
                                    <p>{item.description}</p>
                                  </details>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <small>
                          {pluralize(task.checklist.length, "checklist item", "checklist items")}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="markdown-preview__empty-stage">No tasks in this stage.</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Surface ariaLabel="No importable stages">
          <EmptyState
            title="No importable stages"
            body="Add at least one Markdown stage heading with a task before importing."
          />
        </Surface>
      )}

      <div className="markdown-preview__footer">
        <p>
          {canImport
            ? `Ready to add ${pluralize(taskCount, "task")}.`
            : "Preview is ready, but there are no tasks to import."}
        </p>
        <Button
          type="button"
          className="markdown-preview__action"
          disabled={!canImport || importing}
          onClick={onImport}
        >
          {importing
            ? "Importing plan"
            : `Import ${pluralize(taskCount, "task")}`}
        </Button>
      </div>
    </section>
  );
}
