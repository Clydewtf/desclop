import {
  Button,
  InlineAlert,
  ScreenHeader,
  SectionHeader,
  Surface,
  TextArea
} from "../../shared/ui";

interface UtilitiesProps {
  projectPath: string;
  gitEnabled: boolean;
  gitHealth: string | null;
  markdownExport: string;
  bundleDestination: string;
  bundleFolder: string;
  reselectedLocalPath: string;
  portableStatus: string | null;
  portableError: string | null;
  onOpenImport: () => void;
  onChooseBundleDestination: () => void;
  onChooseBundleFolder: () => void;
  onChooseLocalProjectFolder: () => void;
  onExportPortableBundle: () => void;
  onImportPortableBundle: () => void;
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

export function Utilities({
  projectPath,
  gitEnabled,
  gitHealth,
  markdownExport,
  bundleDestination,
  bundleFolder,
  reselectedLocalPath,
  portableStatus,
  portableError,
  onOpenImport,
  onChooseBundleDestination,
  onChooseBundleFolder,
  onChooseLocalProjectFolder,
  onExportPortableBundle,
  onImportPortableBundle
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

      <Surface ariaLabel="Project settings">
        <SectionHeader title="Project settings" />
        <dl className="settings-list">
          <div>
            <dt>Project path</dt>
            <dd>{projectPath}</dd>
          </div>
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
        <p className="utilities-note">
          Readable Markdown for copying, sharing, or archiving the current plan.
        </p>
        <TextArea
          id="markdown-export"
          label="Markdown preview"
          readOnly
          value={markdownExport}
          onChange={() => {}}
        />
      </Surface>

      <Surface ariaLabel="Export portable backup">
        <SectionHeader title="Export portable backup" />
        <p className="utilities-note">
          Export Desclop workflow data into a portable folder for moving machines or creating a restore point.
        </p>
        <InlineAlert tone="info">
          Portable bundles include Desclop workflow data only. They do not copy your source code repository.
        </InlineAlert>
        <ReadonlyPathField
          id="bundle-destination"
          label="Destination folder"
          value={bundleDestination}
          placeholder="No folder selected"
          buttonLabel="Choose destination folder"
          onChoose={onChooseBundleDestination}
        />
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
        <SectionHeader title="Import portable backup" />
        <p className="utilities-note">
          Restore Desclop workflow data from a backup folder and reconnect it to the local project folder.
        </p>
        <ReadonlyPathField
          id="bundle-folder"
          label="Backup folder"
          value={bundleFolder}
          placeholder="No backup folder selected"
          buttonLabel="Choose backup folder"
          onChoose={onChooseBundleFolder}
        />
        <ReadonlyPathField
          id="reselected-local-path"
          label="Local project folder"
          value={reselectedLocalPath}
          placeholder="No local project folder selected"
          buttonLabel="Choose local project folder"
          onChoose={onChooseLocalProjectFolder}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!bundleFolder.trim() || !reselectedLocalPath.trim()}
          onClick={onImportPortableBundle}
        >
          Import portable backup
        </Button>
      </Surface>
    </section>
  );
}
