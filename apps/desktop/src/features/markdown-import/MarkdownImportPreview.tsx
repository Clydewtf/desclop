import type { ParsedMarkdownPlan } from "./markdownParser";
import { Button, EmptyState, InlineAlert, Surface } from "../../shared/ui";

interface MarkdownImportPreviewProps {
  parsed: ParsedMarkdownPlan;
  importing?: boolean;
  onImport: () => void;
}

export function MarkdownImportPreview({
  parsed,
  importing = false,
  onImport
}: MarkdownImportPreviewProps) {
  return (
    <section className="stack" aria-labelledby="preview-title">
      <h2 id="preview-title">Import preview</h2>
      {parsed.warnings.length > 0 ? (
        <InlineAlert tone="warning">
          {parsed.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </InlineAlert>
      ) : null}
      {parsed.stages.length > 0 ? (
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
      ) : (
        <Surface ariaLabel="No importable stages">
          <EmptyState
            title="No importable stages"
            body="Add at least one Markdown heading with tasks before importing."
          />
        </Surface>
      )}
      <Button
        type="button"
        className="markdown-preview__action"
        disabled={parsed.stages.length === 0 || importing}
        onClick={onImport}
      >
        {importing ? "Importing plan" : "Import plan"}
      </Button>
    </section>
  );
}
