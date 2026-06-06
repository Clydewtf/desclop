import {
  ClipboardPenLine,
  Clock3,
  Download,
  Home,
  Map,
  Upload,
  type LucideIcon
} from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "../../shared/ui";

export type AppDestination = "setup" | "today" | "plan" | "timeline" | "import" | "utilities";

interface AppShellProps {
  activeDestination: AppDestination;
  projectName?: string | null;
  projectStatus?: string | null;
  onNavigate?: (destination: AppDestination) => void;
  onQuickCapture?: () => void;
  children: ReactNode;
}

interface ShellDestination {
  destination: AppDestination;
  label: string;
  icon: LucideIcon;
}

const workDestinations: ShellDestination[] = [
  { destination: "today", label: "Today", icon: Home },
  { destination: "plan", label: "Plan", icon: Map },
  { destination: "timeline", label: "Timeline", icon: Clock3 }
];

const projectDestinations: ShellDestination[] = [
  { destination: "import", label: "Import Plan", icon: Upload },
  { destination: "utilities", label: "Export / Settings", icon: Download }
];

export function AppShell({
  activeDestination,
  projectName,
  projectStatus,
  onNavigate,
  onQuickCapture,
  children
}: AppShellProps) {
  const hasProject = Boolean(projectName);

  function renderDestinationButton(item: ShellDestination) {
    const Icon = item.icon;
    const isActive = activeDestination === item.destination;

    return (
      <Button
        key={item.destination}
        variant={isActive ? "secondary" : "ghost"}
        className="app-nav__button"
        aria-current={isActive ? "page" : undefined}
        icon={<Icon aria-hidden="true" />}
        onClick={() => onNavigate?.(item.destination)}
      >
        {item.label}
      </Button>
    );
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__identity">
          <strong>{projectName ?? "Desclop"}</strong>
          {projectStatus ? <span>{projectStatus}</span> : null}
        </div>
        {hasProject ? (
          <>
            <Button
              variant="secondary"
              className="app-sidebar__capture"
              icon={<ClipboardPenLine aria-hidden="true" />}
              onClick={onQuickCapture}
            >
              Capture
            </Button>
            <nav className="app-nav" aria-label="Primary">
              <section className="app-nav__section" aria-labelledby="app-nav-work">
                <h2 id="app-nav-work">Work</h2>
                <div className="app-nav__items">{workDestinations.map(renderDestinationButton)}</div>
              </section>
              <section className="app-nav__section" aria-labelledby="app-nav-project">
                <h2 id="app-nav-project">Project</h2>
                <div className="app-nav__items">{projectDestinations.map(renderDestinationButton)}</div>
              </section>
            </nav>
          </>
        ) : null}
      </aside>
      <section className="app-content">{children}</section>
    </main>
  );
}
