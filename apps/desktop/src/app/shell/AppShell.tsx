import {
  ArrowLeftRight,
  ClipboardPenLine,
  CircleHelp,
  Clock3,
  Download,
  Home,
  Map,
  Settings2,
  Upload,
  type LucideIcon
} from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "../../shared/ui";

export type AppDestination =
  | "setup"
  | "today"
  | "plan"
  | "timeline"
  | "import"
  | "utilities"
  | "settings";

interface AppShellProps {
  activeDestination: AppDestination;
  projectName?: string | null;
  projectStatus?: string | null;
  scrollScope?: string;
  onNavigate?: (destination: AppDestination) => void;
  onQuickCapture?: () => void;
  onOpenHelp?: () => void;
  onCloseProject?: () => void;
  onBackToProjects?: () => void;
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
  { destination: "utilities", label: "Backups", icon: Download }
];

const globalDestinations: ShellDestination[] = [
  { destination: "settings", label: "Settings", icon: Settings2 }
];

export function AppShell({
  activeDestination,
  projectName,
  projectStatus,
  scrollScope,
  onNavigate,
  onQuickCapture,
  onOpenHelp,
  onCloseProject,
  onBackToProjects,
  children
}: AppShellProps) {
  const hasProject = Boolean(projectName);
  const contentRef = useRef<HTMLElement | null>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const previousScrollKeyRef = useRef<string | null>(null);
  const resolvedScrollScope = scrollScope ?? projectName ?? "global";
  const scrollKey = `${resolvedScrollScope}:${activeDestination}`;

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }

    if (previousScrollKeyRef.current) {
      scrollPositionsRef.current[previousScrollKeyRef.current] = content.scrollTop;
    }

    content.scrollTop = scrollPositionsRef.current[scrollKey] ?? 0;
    previousScrollKeyRef.current = scrollKey;
  }, [scrollKey]);

  function renderDestinationButton(item: ShellDestination) {
    const Icon = item.icon;
    const isActive = activeDestination === item.destination;

    return (
      <Button
        key={item.destination}
        variant={isActive ? "secondary" : "ghost"}
        className={
          item.destination === "settings"
            ? "app-nav__button app-sidebar__icon-button"
            : "app-nav__button"
        }
        aria-label={item.destination === "settings" ? item.label : undefined}
        title={item.destination === "settings" ? item.label : undefined}
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
      <aside className="app-sidebar" aria-label="Application">
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
                <div className="app-nav__heading" id="app-nav-work">
                  Work
                </div>
                <div className="app-nav__items">{workDestinations.map(renderDestinationButton)}</div>
              </section>
              <section className="app-nav__section" aria-labelledby="app-nav-project">
                <div className="app-nav__heading" id="app-nav-project">
                  Project
                </div>
                <div className="app-nav__items">{projectDestinations.map(renderDestinationButton)}</div>
              </section>
            </nav>
          </>
        ) : null}
        <div className="app-sidebar__footer">
          {hasProject && onCloseProject ? (
            <Button
              variant="ghost"
              className="app-nav__button app-nav__project-action app-sidebar__switch"
              icon={<ArrowLeftRight aria-hidden="true" />}
              onClick={onCloseProject}
            >
              Switch project
            </Button>
          ) : null}
          {!hasProject && onBackToProjects ? (
            <Button
              variant="ghost"
              className="app-nav__button app-nav__project-action app-sidebar__switch"
              onClick={onBackToProjects}
            >
              Back to projects
            </Button>
          ) : null}
          <div className="app-sidebar__footer-tools">
            {onNavigate ? (
              <nav className="app-nav app-nav--global" aria-label="Application settings">
                <div className="app-nav__items">{globalDestinations.map(renderDestinationButton)}</div>
              </nav>
            ) : null}
            {onOpenHelp ? (
              <Button
                variant="ghost"
                className="app-nav__button app-sidebar__help app-sidebar__icon-button"
                aria-label="Help & plan example"
                title="Help & plan example"
                icon={<CircleHelp aria-hidden="true" />}
                onClick={onOpenHelp}
              >
                Help &amp; plan example
              </Button>
            ) : null}
          </div>
        </div>
      </aside>
      <section
        ref={contentRef}
        className="app-content"
        onScroll={(event) => {
          scrollPositionsRef.current[scrollKey] = event.currentTarget.scrollTop;
        }}
      >
        {children}
      </section>
    </main>
  );
}
