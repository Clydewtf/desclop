import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  ChecklistItem,
  GitCommit,
  Note,
  Plan,
  Project,
  Stage,
  Task,
  WorkEntry
} from "../../shared/domain/types";
import {
  Button,
  InlineAlert,
  SectionHeader,
  SelectField,
  TextArea
} from "../../shared/ui";
import {
  buildContextExportFields,
  composeContextExport,
  type ContextExportFieldId,
  type ContextExportInput
} from "./contextExport";

export interface ContextExportProps {
  project: Project;
  plans: Plan[];
  stages: Stage[];
  tasks: Task[];
  checklistItems: ChecklistItem[];
  workEntries: WorkEntry[];
  notes: Note[];
  linkedCommits: GitCommit[];
  selectedPlanId: string | null;
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;
  onPlanChange: (planId: string) => void;
  onTaskChange: (taskId: string) => void;
  onRefresh: () => void;
  onCopy: (markdown: string) => void;
}

type Drafts = Record<ContextExportFieldId, string>;
type IncludedFields = Record<ContextExportFieldId, boolean>;

export function ContextExport({
  project,
  plans,
  stages,
  tasks,
  checklistItems,
  workEntries,
  notes,
  linkedCommits,
  selectedPlanId,
  selectedTaskId,
  loading,
  error,
  onPlanChange,
  onTaskChange,
  onRefresh,
  onCopy
}: ContextExportProps) {
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedStage = selectedTask
    ? stages.find((stage) => stage.id === selectedTask.stageId) ?? null
    : null;
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const availableTasks = tasks
    .filter((task) => taskBelongsToPlan(task, selectedPlanId, plans, stages))
    .sort(compareTasks);
  const input: ContextExportInput = {
    project,
    plan: selectedPlan,
    stage: selectedStage,
    task: selectedTask,
    checklistItems,
    workEntries,
    notes,
    linkedCommits
  };
  const fields = useMemo(
    () => buildContextExportFields(input),
    [
      input.checklistItems,
      input.linkedCommits,
      input.notes,
      input.plan,
      input.project,
      input.stage,
      input.task,
      input.workEntries
    ]
  );
  const [drafts, setDrafts] = useState<Drafts>(() => createDrafts(fields));
  const [includedFields, setIncludedFields] = useState<IncludedFields>(() =>
    createIncludedFields(fields)
  );

  useEffect(() => {
    setDrafts(createDrafts(fields));
    setIncludedFields(createIncludedFields(fields));
  }, [fields]);

  const currentFields = fields.map((field) => ({
    ...field,
    preview: drafts[field.id] ?? field.preview,
    included: includedFields[field.id] ?? field.defaultIncluded
  }));
  const composedMarkdown = composeContextExport(currentFields);
  const includedCount = currentFields.filter((field) => field.included).length;

  function updateDraft(fieldId: ContextExportFieldId, value: string) {
    setDrafts((current) => ({ ...current, [fieldId]: value }));
  }

  function toggleField(fieldId: ContextExportFieldId, event: ChangeEvent<HTMLInputElement>) {
    setIncludedFields((current) => ({ ...current, [fieldId]: event.target.checked }));
  }

  return (
    <details className="context-export">
      <summary className="context-export__summary">
        <span>Manual AI context export</span>
        <span className="context-export__summary-toggle" aria-hidden="true">
          <span className="context-export__toggle-open">Show</span>
          <span className="context-export__toggle-close">Hide</span>
        </span>
      </summary>
      <div className="context-export__body stack">
        <SectionHeader
          title="Review and copy"
          action={
            <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
              {loading ? "Reading local context" : "Refresh local context"}
            </Button>
          }
        />
        <p className="utilities-note ui-help-text">
          Choose a plan and task, review every field, edit or exclude anything, then copy the Markdown manually. This reads local records only; it does not call AI or send data anywhere.
        </p>

        <div className="context-export__selectors">
          <SelectField
            id="context-export-plan-selection"
            label="Plan"
            hint="The selected task's plan is chosen automatically."
            value={selectedPlanId ?? ""}
            onChange={(event) => onPlanChange(event.target.value)}
            disabled={loading || plans.length === 0}
          >
            <option value="">No plan selected</option>
            {plans.slice().sort((left, right) => left.position - right.position).map((plan) => (
              <option key={plan.id} value={plan.id}>
                Plan: {plan.title}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="context-export-task-selection"
            label="Task"
            hint="Task-scoped notes, reviews, and commits come from this selection."
            value={selectedTaskId ?? ""}
            onChange={(event) => onTaskChange(event.target.value)}
            disabled={loading || availableTasks.length === 0}
          >
            <option value="">No task selected</option>
            {availableTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </SelectField>
        </div>

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        <div className="context-export__fields" aria-label="Context fields">
          {currentFields.map((field) => (
            <section className="context-export__field" key={field.id}>
              <label className="context-export__toggle">
                <input
                  type="checkbox"
                  checked={field.included}
                  onChange={(event) => toggleField(field.id, event)}
                  aria-label={`Include ${field.title}`}
                />
                <span>
                  <strong>{field.title}</strong>
                  <span className="ui-help-text">
                    {field.included ? "Included in copy" : "Excluded from copy"}
                  </span>
                </span>
              </label>
              <TextArea
                id={`context-export-${field.id}`}
                label={`${field.title} preview`}
                value={field.preview}
                onChange={(event) => updateDraft(field.id, event.target.value)}
                hint="Edit this field locally before copying."
              />
            </section>
          ))}
        </div>

        <div className="ui-field context-export__combined-preview">
          <label className="ui-field__label" htmlFor="context-export-combined-preview">
            Full Markdown preview
          </label>
          <div className="context-export__combined-code">
            <Button
              type="button"
              variant="secondary"
              className="context-export__copy"
              disabled={includedCount === 0 || loading}
              onClick={() => onCopy(composedMarkdown)}
            >
              Copy
            </Button>
            <textarea
              id="context-export-combined-preview"
              className="ui-textarea context-export__combined-textarea"
              aria-describedby="context-export-combined-preview-hint"
              readOnly
              spellCheck={false}
              value={composedMarkdown}
              onChange={() => {}}
            />
          </div>
          <span className="ui-field__hint ui-help-text" id="context-export-combined-preview-hint">
            {includedCount} of {currentFields.length} fields will be copied.
          </span>
        </div>
      </div>
    </details>
  );
}

function createDrafts(fields: ReturnType<typeof buildContextExportFields>) {
  return Object.fromEntries(fields.map((field) => [field.id, field.preview])) as Drafts;
}

function createIncludedFields(fields: ReturnType<typeof buildContextExportFields>) {
  return Object.fromEntries(
    fields.map((field) => [field.id, field.defaultIncluded])
  ) as IncludedFields;
}

function taskBelongsToPlan(
  task: Task,
  planId: string | null,
  plans: Plan[],
  stages: Stage[]
) {
  if (!planId) {
    return true;
  }

  const stage = stages.find((candidate) => candidate.id === task.stageId);
  if (stage?.planId === planId) {
    return true;
  }

  return plans.length === 1 && !stage?.planId && plans[0]?.id === planId;
}

function compareTasks(left: Task, right: Task) {
  return left.position - right.position || left.id.localeCompare(right.id);
}
