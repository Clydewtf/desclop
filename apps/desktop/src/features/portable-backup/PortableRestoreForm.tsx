import type { PortableBundlePreview } from "../../shared/api/client";
import { Button, InlineAlert } from "../../shared/ui";

interface PortableRestoreFormProps {
  backupPath: string;
  localProjectPath: string;
  preview: PortableBundlePreview | null;
  error?: string | null;
  idPrefix: string;
  onChooseBackupFile: () => void;
  onChooseLegacyBackupFolder: () => void;
  onChooseLocalProjectFolder: () => void;
  onReview: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ReadonlyPathField({
  id,
  label,
  value,
  placeholder,
  buttonLabel,
  onChoose
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  buttonLabel: string;
  onChoose: () => void;
}) {
  return (
    <div className="path-picker">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="path-picker__row">
        <input
          id={id}
          className="ui-input path-picker__input"
          value={value}
          placeholder={placeholder}
          readOnly
        />
        <Button type="button" variant="secondary" onClick={onChoose}>
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

export function PortableRestoreForm({
  backupPath,
  localProjectPath,
  preview,
  error,
  idPrefix,
  onChooseBackupFile,
  onChooseLegacyBackupFolder,
  onChooseLocalProjectFolder,
  onReview,
  onConfirm,
  onCancel
}: PortableRestoreFormProps) {
  return (
    <div className="portable-restore">
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <ReadonlyPathField
        id={`${idPrefix}-backup-file`}
        label="Backup file"
        value={backupPath}
        placeholder="No .desclop backup selected"
        buttonLabel="Choose backup file"
        onChoose={onChooseBackupFile}
      />
      <Button
        type="button"
        variant="ghost"
        className="portable-restore__legacy-picker"
        onClick={onChooseLegacyBackupFolder}
      >
        Choose legacy backup folder
      </Button>
      <p className="ui-help-text portable-restore__legacy-help">
        Use this only for backups made by older Desclop versions that were stored as folders.
      </p>
      <ReadonlyPathField
        id={`${idPrefix}-local-project-folder`}
        label="Local project folder"
        value={localProjectPath}
        placeholder="No local project folder selected"
        buttonLabel="Choose local project folder"
        onChoose={onChooseLocalProjectFolder}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={!backupPath.trim() || !localProjectPath.trim()}
        onClick={onReview}
      >
        Review portable restore
      </Button>

      {preview ? (
        <div role="dialog" aria-label="Confirm portable backup restore" className="utilities-confirmation">
          <h2>Confirm portable restore</h2>
          <p>
            Restore <strong>{preview.projectName}</strong> as a separate project? Existing projects and their data will not be overwritten.
          </p>
          <ul>
            <li>{preview.planCount} plans</li>
            <li>{preview.stageCount} stages</li>
            <li>{preview.taskCount} tasks</li>
            <li>{preview.noteCount} notes</li>
            <li>{preview.workEntryCount} work history entries</li>
          </ul>
          {preview.compatibility === "legacy_v1" ? (
            <InlineAlert tone="warning">
              This is a legacy v1 backup. It did not store plan grouping, so its stages will be restored into one Imported plan.
            </InlineAlert>
          ) : null}
          <div className="utilities-confirmation__actions">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm}>
              Confirm restore
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Keeps the technical support report selectable even when clipboard access is unavailable. */
export function TechnicalSupportReport({
  value,
  onCopy
}: {
  value: string;
  onCopy: () => void;
}) {
  return (
    <details className="utilities-support-report">
      <summary>For support</summary>
      <p className="ui-help-text">
        This is a manual, local support report. It contains application, database, folder, Git, and backup states only — not project names, paths, plans, tasks, notes, or work history.
      </p>
      <div className="ui-field utilities-support-report__field">
        <label className="ui-field__label" htmlFor="support-diagnostics">
          Technical support report
        </label>
        <div className="utilities-support-report__code">
          <Button
            type="button"
            variant="secondary"
            className="utilities-support-report__copy"
            onClick={onCopy}
          >
            Copy
          </Button>
          <textarea
            id="support-diagnostics"
            className="ui-textarea utilities-support-report__textarea"
            readOnly
            spellCheck={false}
            value={value}
          />
        </div>
      </div>
    </details>
  );
}
