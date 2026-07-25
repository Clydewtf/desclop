import type { PortableBundlePreview, ProjectDiagnostics } from "../../shared/api/client";
import { Button, InlineAlert, ScreenHeader, SectionHeader, Surface, TextArea } from "../../shared/ui";
import {
  PortableRestoreForm,
  TechnicalSupportReport
} from "../portable-backup/PortableRestoreForm";

export interface MarkdownExportItem {
  id: string;
  title: string;
  markdown: string;
}

interface UtilitiesProps {
  projectPath: string;
  gitEnabled: boolean;
  gitHealth: string | null;
  markdownExports: MarkdownExportItem[];
  bundleDestination: string;
  bundleFolder: string;
  reselectedLocalPath: string;
  portableStatus: string | null;
  portableError: string | null;
  restorePreview: PortableBundlePreview | null;
  diagnostics: ProjectDiagnostics | null;
  diagnosticsLoading: boolean;
  diagnosticsError: string | null;
  relinkPath: string;
  onOpenImport: () => void;
  onChooseBundleDestination: () => void;
  onChooseBundleFile: () => void;
  onChooseLegacyBundleFolder: () => void;
  onChooseLocalProjectFolder: () => void;
  onChooseRelinkFolder: () => void;
  onExportPortableBundle: () => void;
  onReviewPortableRestore: () => void;
  onConfirmPortableRestore: () => void;
  onCancelPortableRestore: () => void;
  onRefreshDiagnostics: () => void;
  onCopySupportDiagnostics: () => void;
  onCopyMarkdown: (markdown: string, planTitle: string) => void;
  onConfirmRelink: () => void;
  onCancelRelink: () => void;
}

function humanize(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }
  return value.replace(/_/g, " ");
}

export function Utilities({
  projectPath,
  gitEnabled,
  gitHealth,
  markdownExports,
  bundleDestination,
  bundleFolder,
  reselectedLocalPath,
  portableStatus,
  portableError,
  restorePreview,
  diagnostics,
  diagnosticsLoading,
  diagnosticsError,
  relinkPath,
  onOpenImport,
  onChooseBundleDestination,
  onChooseBundleFile,
  onChooseLegacyBundleFolder,
  onChooseLocalProjectFolder,
  onChooseRelinkFolder,
  onExportPortableBundle,
  onReviewPortableRestore,
  onConfirmPortableRestore,
  onCancelPortableRestore,
  onRefreshDiagnostics,
  onCopySupportDiagnostics,
  onCopyMarkdown,
  onConfirmRelink,
  onCancelRelink
}: UtilitiesProps) {
  return (
    <section className="utilities-screen">
      <ScreenHeader
        eyebrow="Project"
        title="Export / Import"
        description="Human-readable plan export, portable Desclop backups, local project boundaries, and restore tools."
      />

      {portableError ? <InlineAlert tone="error">{portableError}</InlineAlert> : null}
      {portableStatus ? <InlineAlert tone="info">{portableStatus}</InlineAlert> : null}

      <Surface ariaLabel="Project health">
        <SectionHeader
          title="Project health"
          action={
            <Button type="button" variant="secondary" onClick={onRefreshDiagnostics}>
              {diagnosticsLoading ? "Checking" : "Refresh diagnostics"}
            </Button>
          }
        />
        {diagnosticsError ? <InlineAlert tone="error">{diagnosticsError}</InlineAlert> : null}
        {diagnostics ? (
          <>
            <p className="utilities-note ui-help-text">
              A local check of the folder, Git connection, database, and latest backup. It does not send data anywhere.
            </p>
            <dl className="settings-list">
              <div>
                <dt>Project folder</dt>
                <dd>{humanize(diagnostics.folderState)}</dd>
              </div>
              <div>
                <dt>Saved path</dt>
                <dd>{diagnostics.projectPath}</dd>
              </div>
              <div>
                <dt>Git</dt>
                <dd>
                  {diagnostics.git.configured ? "Configured" : "Disabled"}
                  {diagnostics.git.repositoryDetected === null
                    ? " · folder unavailable"
                    : diagnostics.git.repositoryDetected
                      ? " · repository detected"
                      : " · no repository detected"}
                </dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd>
                  {humanize(diagnostics.database.state)} · schema {diagnostics.database.schemaVersion ?? "?"}/
                  {diagnostics.database.targetSchemaVersion} · integrity {diagnostics.database.integrity}
                </dd>
              </div>
              <div>
                <dt>Last backup</dt>
                <dd>
                  {diagnostics.lastBackup.state === "none"
                    ? "None yet"
                    : `${humanize(diagnostics.lastBackup.state)} · ${diagnostics.lastBackup.kind ?? "backup"} · ${diagnostics.lastBackup.createdAt ?? "unknown date"}`}
                </dd>
              </div>
            </dl>
            <TechnicalSupportReport
              value={JSON.stringify(diagnostics.supportReport, null, 2)}
              onCopy={onCopySupportDiagnostics}
            />
          </>
        ) : (
          <p className="utilities-note ui-help-text">Run a local check to view database, folder, Git, and backup state.</p>
        )}
        <div className="path-picker">
          <label className="ui-field__label" htmlFor="relink-project-folder">
            Reconnect project folder
          </label>
          <div className="path-picker__row">
            <input
              id="relink-project-folder"
              className="ui-input path-picker__input"
              value={relinkPath}
              placeholder={projectPath}
              readOnly
            />
            <Button type="button" variant="secondary" onClick={onChooseRelinkFolder}>
              Choose new folder
            </Button>
          </div>
        </div>
        {relinkPath ? (
          <div role="dialog" aria-label="Confirm project folder relink" className="utilities-confirmation">
            <p>
              Reconnect this project from <code>{projectPath}</code> to <code>{relinkPath}</code>?
              Planning data stays in Desclop; only the saved local folder path changes.
            </p>
            <div className="utilities-confirmation__actions">
              <Button type="button" variant="secondary" onClick={onCancelRelink}>
                Cancel
              </Button>
              <Button type="button" onClick={onConfirmRelink}>
                Confirm relink
              </Button>
            </div>
          </div>
        ) : null}
      </Surface>

      <Surface ariaLabel="Project settings">
        <SectionHeader title="Project settings" />
        <dl className="settings-list">
          <div>
            <dt>Git</dt>
            <dd>{gitEnabled ? "Enabled" : "Disabled"}</dd>
          </div>
        </dl>
        {gitHealth ? <InlineAlert tone="warning">{gitHealth}</InlineAlert> : null}
      </Surface>

      <Surface ariaLabel="Markdown export">
        <SectionHeader
          title="Markdown export"
          action={
            <Button type="button" variant="secondary" onClick={onOpenImport}>
              Import plan
            </Button>
          }
        />
        <p className="utilities-note ui-help-text">
          Each plan has its own Markdown export, so multiple plans stay separate when copied, shared, or archived.
        </p>
        {markdownExports.length ? (
          <div className="utilities-markdown-exports">
            {markdownExports.map((item, index) => (
              <details className="utilities-markdown-export" key={item.id}>
                <summary className="utilities-markdown-export__summary">
                  <span>{item.title}</span>
                  <span className="utilities-markdown-export__toggle" aria-hidden="true">
                    <span className="utilities-markdown-export__toggle-open">Show</span>
                    <span className="utilities-markdown-export__toggle-close">Hide</span>
                  </span>
                </summary>
                <div className="utilities-markdown-export__header">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onCopyMarkdown(item.markdown, item.title)}
                  >
                    Copy Markdown
                  </Button>
                </div>
                <TextArea
                  id={`markdown-export-${index + 1}`}
                  label={`${item.title} Markdown preview`}
                  readOnly
                  value={item.markdown}
                  onChange={() => {}}
                />
              </details>
            ))}
          </div>
        ) : (
          <p className="utilities-note ui-help-text">Create or import a plan to generate a Markdown export.</p>
        )}
      </Surface>

      <Surface ariaLabel="Export portable backup">
        <SectionHeader title="Export portable backup" />
        <p className="utilities-note ui-help-text">
          Export Desclop workflow data into a new timestamped <code>.desclop</code> file and matching README for moving machines or creating a restore point.
        </p>
        <InlineAlert tone="info">
          The <code>.desclop</code> file holds the backup data. Its matching README contains restore steps only; neither file copies your source code repository or original project path.
        </InlineAlert>
        <div className="path-picker">
          <label className="ui-field__label" htmlFor="bundle-destination">
            Destination folder
          </label>
          <div className="path-picker__row">
            <input
              id="bundle-destination"
              className="ui-input path-picker__input"
              value={bundleDestination}
              placeholder="No folder selected"
              readOnly
            />
            <Button type="button" variant="secondary" onClick={onChooseBundleDestination}>
              Choose destination folder
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!bundleDestination.trim()}
          onClick={onExportPortableBundle}
        >
          Export portable backup
        </Button>
      </Surface>

      <Surface ariaLabel="Import portable backup">
        <SectionHeader title="Restore portable backup" />
        <p className="utilities-note ui-help-text">
          Check compatibility first, then restore into a separate Desclop project and reconnect it to a local folder. Existing projects are never replaced.
        </p>
        <PortableRestoreForm
          idPrefix="utilities"
          backupPath={bundleFolder}
          localProjectPath={reselectedLocalPath}
          preview={restorePreview}
          error={null}
          onChooseBackupFile={onChooseBundleFile}
          onChooseLegacyBackupFolder={onChooseLegacyBundleFolder}
          onChooseLocalProjectFolder={onChooseLocalProjectFolder}
          onReview={onReviewPortableRestore}
          onConfirm={onConfirmPortableRestore}
          onCancel={onCancelPortableRestore}
        />
      </Surface>
    </section>
  );
}
