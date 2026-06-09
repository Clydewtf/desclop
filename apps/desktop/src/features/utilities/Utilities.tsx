import {
  Button,
  EmptyState,
  InlineAlert,
  ScreenHeader,
  SectionHeader,
  Surface
} from "../../shared/ui";

interface UtilitiesProps {
  projectPath: string;
  gitEnabled: boolean;
  gitHealth: string | null;
  onOpenImport: () => void;
}

export function Utilities({
  projectPath,
  gitEnabled,
  gitHealth,
  onOpenImport
}: UtilitiesProps) {
  return (
    <section className="utilities-screen">
      <ScreenHeader
        eyebrow="Project"
        title="Export / Settings"
        description="Project setup, local boundaries, Git state, and maintenance actions."
      />

      <Surface ariaLabel="Project settings">
        <SectionHeader title="Settings" />
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

      <Surface ariaLabel="Import and export">
        <SectionHeader
          title="Import and export"
          action={
            <Button variant="secondary" onClick={onOpenImport}>
              Import plan
            </Button>
          }
        />
        <EmptyState
          title="Export tools are not wired in this alpha build"
          body="Markdown export and portable bundle actions belong here when their backend commands are available."
        />
        <p className="utilities-note">Portable bundles do not copy source code.</p>
      </Surface>
    </section>
  );
}
