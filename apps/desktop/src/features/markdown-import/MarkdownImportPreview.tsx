import type { ParsedMarkdownPlan } from "./markdownParser";

interface MarkdownImportPreviewProps {
  parsed: ParsedMarkdownPlan;
  onImport: () => void;
}

export function MarkdownImportPreview({ parsed, onImport }: MarkdownImportPreviewProps) {
  return (
    <section className="stack" aria-labelledby="preview-title">
      <h2 id="preview-title">Import preview</h2>
      {parsed.warnings.length > 0 ? (
        <div className="warning-list" role="alert">
          {parsed.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
      <div className="stage-list">
        {parsed.stages.map((stage) => (
          <article className="stage-frame" key={`${stage.position}-${stage.title}`}>
            <h3>{stage.title}</h3>
            {stage.tasks.map((task) => (
              <div className="task-row" key={`${task.position}-${task.title}`}>
                <span>{task.title}</span>
                <small>
                  {task.checklist.length} checklist {task.checklist.length === 1 ? "item" : "items"}
                </small>
              </div>
            ))}
          </article>
        ))}
      </div>
      <button type="button" disabled={parsed.stages.length === 0} onClick={onImport}>
        Import plan
      </button>
    </section>
  );
}
