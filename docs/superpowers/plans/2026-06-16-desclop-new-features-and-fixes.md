# Desclop New Features And Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the project picker, sidebar hierarchy, and export/import utility screen so project switching and maintenance flows are clearer without adding deep navigation.

**Architecture:** Keep the desktop app's existing React/Vite/Tauri shape. Add a small read-only project summary API for picker metadata, keep UI formatting in focused frontend helpers, and move the currently inline Export / Import screen into the existing `Utilities` component with explicit props. Use Tauri dialog plugin only for folder selection; portable bundle export/import continues to use existing backend commands.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Tauri 2, Rust, rusqlite, lucide-react, CSS modules via `base.css`.

---

## Scope And Structure

The source spec has three numbered UX areas. This plan keeps them as one implementation plan because they all touch the same desktop shell and can be verified through the existing app test suite:

1. Project picker metadata and safer destructive action hierarchy.
2. Sidebar hierarchy and label refinement.
3. Export / Import screen clarity, folder selection, and manual verification.

## File Structure

- Create: `apps/desktop/src/features/project-setup/projectMetadata.ts`
  - Formats compact project picker metadata from `Project` plus optional `ProjectSummary`.
- Create: `apps/desktop/src/features/project-setup/projectMetadata.test.ts`
  - Unit tests for path shortening, updated date formatting, and state line construction.
- Create: `apps/desktop/src/shared/api/folderDialog.ts`
  - Wraps Tauri dialog folder selection and returns a string path or `null`.
- Create: `apps/desktop/src/shared/api/folderDialog.test.ts`
  - Unit tests for dialog return normalization and no-Tauri fallback.
- Modify: `apps/desktop/src-tauri/src/domain.rs`
  - Add serializable `ProjectSummary`.
- Modify: `apps/desktop/src-tauri/src/repositories/projects.rs`
  - Add `list_project_summaries()` query with counts and active task title.
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs`
  - Expose `list_project_summaries`.
- Modify: `apps/desktop/src-tauri/src/lib.rs`
  - Register the new command and dialog plugin.
- Modify: `apps/desktop/src-tauri/Cargo.toml`
  - Add `tauri-plugin-dialog = "2"`.
- Modify: `apps/desktop/package.json`
  - Add `@tauri-apps/plugin-dialog`.
- Modify: `apps/desktop/src/shared/domain/types.ts`
  - Add frontend `ProjectSummary`.
- Modify: `apps/desktop/src/shared/api/client.ts`
  - Add `listProjectSummaries()`.
- Modify: `apps/desktop/src/shared/api/client.test.ts`
  - Assert new invoke mapping.
- Modify: `apps/desktop/src/features/project-setup/ProjectPicker.tsx`
  - Render metadata under project names and make delete visually secondary.
- Modify: `apps/desktop/src/features/project-setup/ProjectPicker.test.tsx`
  - Cover metadata rendering, quiet delete behavior, and existing confirmation flow.
- Modify: `apps/desktop/src/app/shell/AppShell.tsx`
  - Rename `Export / Import` navigation to `Backups` and lower the visual weight of `Switch project`.
- Modify: `apps/desktop/src/app/shell/AppShell.test.tsx`
  - Cover label and project-action hierarchy.
- Modify: `apps/desktop/src/features/utilities/Utilities.tsx`
  - Replace placeholder utility screen with clear Markdown export, export backup, and import backup sections.
- Modify: `apps/desktop/src/features/utilities/Utilities.test.tsx`
  - Cover helper copy, readonly path fields, disabled/enabled buttons, and callbacks.
- Modify: `apps/desktop/src/app/App.tsx`
  - Load summaries, pass metadata to picker, wire `Utilities`, choose-folder actions, portable success/error messages.
- Modify: `apps/desktop/src/app/App.test.tsx`
  - Cover summary loading fallback, new sidebar label, markdown preview, folder selection, portable export/import flows.
- Modify: `apps/desktop/src/styles/base.css`
  - Add compact project row metadata, quieter project actions, sidebar density tweaks, and utility path-picker layout.

---

### Task 1: Add Read-Only Project Summaries

**Files:**
- Modify: `apps/desktop/src-tauri/src/domain.rs`
- Modify: `apps/desktop/src-tauri/src/repositories/projects.rs`
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/shared/domain/types.ts`
- Modify: `apps/desktop/src/shared/api/client.ts`
- Modify: `apps/desktop/src/shared/api/client.test.ts`

- [ ] **Step 1: Write the failing Rust repository test**

Add this test inside `apps/desktop/src-tauri/src/repositories/projects.rs` `#[cfg(test)] mod tests`:

```rust
#[test]
fn list_project_summaries_returns_counts_and_active_task_title() {
    let conn = create_memory_connection().expect("memory database");
    run_migrations(&conn).expect("migrations");
    let repo = ProjectRepository::new(&conn);

    let project = repo
        .create_project("Desclop".to_string(), "/tmp/desclop".to_string(), false)
        .expect("create project");

    conn.execute(
        "insert into stages (id, project_id, title, position, status, created_at, updated_at)
         values ('stage-1', ?1, 'Stage', 0, 'current', 'now', 'now')",
        params![project.id],
    )
    .expect("insert stage");
    conn.execute(
        "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
         values ('task-active', ?1, 'stage-1', 'Delete project', 'active', 0, 'now', 'now')",
        params![project.id],
    )
    .expect("insert active task");
    conn.execute(
        "insert into tasks (id, project_id, stage_id, title, status, position, created_at, updated_at)
         values ('task-done', ?1, 'stage-1', 'Finished task', 'done', 1, 'now', 'now')",
        params![project.id],
    )
    .expect("insert done task");
    conn.execute(
        "update projects set active_task_id = 'task-active' where id = ?1",
        params![project.id],
    )
    .expect("set active task");
    conn.execute(
        "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
         values ('inbox-open', ?1, null, 'Check import copy', 'note', 'open', 'now', 'now')",
        params![project.id],
    )
    .expect("insert open inbox item");
    conn.execute(
        "insert into inbox_items (id, project_id, task_id, body, kind, status, created_at, updated_at)
         values ('inbox-deleted', ?1, null, 'Hidden item', 'note', 'deleted', 'now', 'now')",
        params![project.id],
    )
    .expect("insert deleted inbox item");

    let summaries = repo.list_project_summaries().expect("list summaries");

    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].project_id, project.id);
    assert_eq!(summaries[0].task_count, 2);
    assert_eq!(summaries[0].open_inbox_count, 1);
    assert_eq!(summaries[0].active_task_title.as_deref(), Some("Delete project"));
}
```

- [ ] **Step 2: Run the Rust test and verify it fails**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml repositories::projects::tests::list_project_summaries_returns_counts_and_active_task_title
```

Expected: FAIL with an error that `ProjectRepository` has no method named `list_project_summaries`.

- [ ] **Step 3: Add the backend domain type and repository query**

In `apps/desktop/src-tauri/src/domain.rs`, add after `Project`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub project_id: Id,
    pub task_count: i64,
    pub open_inbox_count: i64,
    pub active_task_title: Option<String>,
}
```

In `apps/desktop/src-tauri/src/repositories/projects.rs`, change the import and add the method:

```rust
use crate::domain::{Project, ProjectSummary};
```

```rust
pub fn list_project_summaries(&self) -> rusqlite::Result<Vec<ProjectSummary>> {
    let mut stmt = self.conn.prepare(
        "select
            projects.id,
            count(distinct tasks.id) as task_count,
            count(distinct case when inbox_items.status = 'open' then inbox_items.id end) as open_inbox_count,
            active_tasks.title as active_task_title
         from projects
         left join tasks on tasks.project_id = projects.id
         left join inbox_items on inbox_items.project_id = projects.id
         left join tasks active_tasks
           on active_tasks.project_id = projects.id
          and active_tasks.id = projects.active_task_id
         group by projects.id, active_tasks.title
         order by projects.updated_at desc",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(ProjectSummary {
            project_id: row.get(0)?,
            task_count: row.get(1)?,
            open_inbox_count: row.get(2)?,
            active_task_title: row.get(3)?,
        })
    })?;

    rows.collect()
}
```

- [ ] **Step 4: Run the Rust test and verify it passes**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml repositories::projects::tests::list_project_summaries_returns_counts_and_active_task_title
```

Expected: PASS.

- [ ] **Step 5: Expose the Tauri command**

In `apps/desktop/src-tauri/src/commands/projects.rs`, update imports and add:

```rust
use crate::domain::{CreateProjectInput, Project, ProjectSummary};
```

```rust
#[tauri::command]
pub fn list_project_summaries(state: State<'_, AppState>) -> Result<Vec<ProjectSummary>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .list_project_summaries()
        .map_err(|err| err.to_string())
}
```

In `apps/desktop/src-tauri/src/lib.rs`, add `commands::projects::list_project_summaries` to `tauri::generate_handler![...]` directly after `commands::projects::list_projects`.

- [ ] **Step 6: Add frontend types and API mapping**

In `apps/desktop/src/shared/domain/types.ts`, add after `Project`:

```ts
export interface ProjectSummary {
  projectId: Id;
  taskCount: number;
  openInboxCount: number;
  activeTaskTitle: string | null;
}
```

In `apps/desktop/src/shared/api/client.ts`, import `ProjectSummary` and add:

```ts
listProjectSummaries: () => invoke<ProjectSummary[]>("list_project_summaries"),
```

Add this test to `apps/desktop/src/shared/api/client.test.ts`:

```ts
it("invokes the list_project_summaries command", async () => {
  await api.listProjectSummaries();

  expect(invoke).toHaveBeenCalledWith("list_project_summaries");
});
```

- [ ] **Step 7: Run API and repository tests**

Run:

```bash
npm --workspace apps/desktop run test -- src/shared/api/client.test.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml repositories::projects
```

Expected: both commands PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/domain.rs apps/desktop/src-tauri/src/repositories/projects.rs apps/desktop/src-tauri/src/commands/projects.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src/shared/domain/types.ts apps/desktop/src/shared/api/client.ts apps/desktop/src/shared/api/client.test.ts
git commit -m "feat: add project summaries"
```

---

### Task 2: Render Lightweight Project Picker Metadata

**Files:**
- Create: `apps/desktop/src/features/project-setup/projectMetadata.ts`
- Create: `apps/desktop/src/features/project-setup/projectMetadata.test.ts`
- Modify: `apps/desktop/src/features/project-setup/ProjectPicker.tsx`
- Modify: `apps/desktop/src/features/project-setup/ProjectPicker.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`
- Modify: `apps/desktop/src/styles/base.css`

- [ ] **Step 1: Write failing metadata helper tests**

Create `apps/desktop/src/features/project-setup/projectMetadata.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Project, ProjectSummary } from "../../shared/domain/types";
import { buildProjectMetadataParts, shortenHomePath } from "./projectMetadata";

const project: Project = {
  id: "p1",
  name: "Desclop",
  localPath: "/Users/clyde/projects/desclop",
  gitEnabled: true,
  gitRemote: null,
  activeTaskId: "t1",
  createdAt: "2026-06-15T10:00:00.000Z",
  updatedAt: "2026-06-16T10:00:00.000Z"
};

const summary: ProjectSummary = {
  projectId: "p1",
  taskCount: 12,
  openInboxCount: 3,
  activeTaskTitle: "Delete project"
};

describe("projectMetadata", () => {
  it("shortens paths under the current user's home folder", () => {
    expect(shortenHomePath("/Users/clyde/projects/desclop", "/Users/clyde")).toBe(
      "~/projects/desclop"
    );
  });

  it("builds path, updated date, and state metadata", () => {
    expect(buildProjectMetadataParts(project, summary, "/Users/clyde")).toEqual([
      "~/projects/desclop",
      "Updated Jun 16, 2026",
      "12 tasks",
      "3 inbox items",
      "Active: Delete project"
    ]);
  });

  it("shows no plan imported when no summary work exists", () => {
    expect(
      buildProjectMetadataParts(
        { ...project, activeTaskId: null },
        { projectId: "p1", taskCount: 0, openInboxCount: 0, activeTaskTitle: null },
        "/Users/clyde"
      )
    ).toContain("No plan imported");
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
npm --workspace apps/desktop run test -- src/features/project-setup/projectMetadata.test.ts
```

Expected: FAIL with a module resolution error for `./projectMetadata`.

- [ ] **Step 3: Implement metadata helpers**

Create `apps/desktop/src/features/project-setup/projectMetadata.ts`:

```ts
import type { Project, ProjectSummary } from "../../shared/domain/types";

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function shortenHomePath(path: string, homePath = "") {
  if (homePath && path === homePath) {
    return "~";
  }
  if (homePath && path.startsWith(`${homePath}/`)) {
    return `~/${path.slice(homePath.length + 1)}`;
  }
  return path;
}

export function formatUpdatedDate(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Updated date unavailable";
  }
  return `Updated ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date)}`;
}

export function buildProjectMetadataParts(
  project: Project,
  summary: ProjectSummary | null | undefined,
  homePath = ""
) {
  const parts = [shortenHomePath(project.localPath, homePath), formatUpdatedDate(project.updatedAt)];

  if (!summary || (summary.taskCount === 0 && summary.openInboxCount === 0)) {
    parts.push("No plan imported");
    return parts;
  }

  parts.push(pluralize(summary.taskCount, "task", "tasks"));
  if (summary.openInboxCount > 0) {
    parts.push(pluralize(summary.openInboxCount, "inbox item", "inbox items"));
  }
  if (summary.activeTaskTitle) {
    parts.push(`Active: ${summary.activeTaskTitle}`);
  }

  return parts;
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
npm --workspace apps/desktop run test -- src/features/project-setup/projectMetadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing ProjectPicker tests**

In `apps/desktop/src/features/project-setup/ProjectPicker.test.tsx`, add:

```ts
it("shows compact metadata under each project name", () => {
  renderPicker({
    projectSummaries: {
      [project.id]: {
        projectId: project.id,
        taskCount: 12,
        openInboxCount: 3,
        activeTaskTitle: "Create local store"
      }
    },
    homePath: "/tmp"
  });

  const row = screen.getByRole("group", { name: project.name });

  expect(within(row).getByText("~/desclop-manual-qa", { exact: false })).toBeInTheDocument();
  expect(within(row).getByText("12 tasks", { exact: false })).toBeInTheDocument();
  expect(within(row).getByText("3 inbox items", { exact: false })).toBeInTheDocument();
  expect(within(row).getByText("Active: Create local store", { exact: false })).toBeInTheDocument();
});

it("keeps Open project as the primary row action", () => {
  renderPicker();

  const row = screen.getByRole("group", { name: project.name });
  const openButton = within(row).getByRole("button", { name: /Desclop Manual QA.*Open project/s });
  const deleteButton = within(row).getByRole("button", { name: `Delete ${project.name}` });

  expect(openButton).toHaveAttribute("data-project-action", "open");
  expect(deleteButton).toHaveClass("project-picker__delete");
});
```

Update the local `RenderPickerOptions` in that test file:

```ts
projectSummaries?: Record<string, ProjectSummary>;
homePath?: string;
```

Pass the new props to `<ProjectPicker />` in `renderPicker`.

- [ ] **Step 6: Run ProjectPicker tests and verify they fail**

Run:

```bash
npm --workspace apps/desktop run test -- src/features/project-setup/ProjectPicker.test.tsx
```

Expected: FAIL because `ProjectPicker` does not accept `projectSummaries` and does not render metadata.

- [ ] **Step 7: Implement ProjectPicker metadata and quiet delete styling hook**

In `ProjectPicker.tsx`, import the helper and `ProjectSummary`:

```ts
import { type Project, type ProjectSummary } from "../../shared/domain/types";
import { buildProjectMetadataParts } from "./projectMetadata";
```

Extend props:

```ts
projectSummaries?: Record<string, ProjectSummary>;
homePath?: string;
```

Default props:

```ts
projectSummaries = {},
homePath = ""
```

Inside the `.map`, compute:

```ts
const metadataParts = buildProjectMetadataParts(
  project,
  projectSummaries[project.id],
  homePath
);
```

Replace the open button contents with:

```tsx
<span className="project-picker__summary">
  <span className="project-picker__name">{project.name}</span>
  <span className="project-picker__meta">{metadataParts.join(" · ")}</span>
</span>
<span className="project-picker__action">Open project</span>
```

Add `className="project-picker__delete"` and `variant="ghost"` to the delete button.

- [ ] **Step 8: Wire summaries into App**

In `App.tsx`, add:

```ts
const [projectSummaries, setProjectSummaries] = useState<Record<string, ProjectSummary>>({});
```

Add helpers near `loadListOrEmpty`:

```ts
function indexProjectSummaries(summaries: ProjectSummary[]) {
  return Object.fromEntries(summaries.map((summary) => [summary.projectId, summary]));
}

async function loadProjectSummariesOrEmpty() {
  try {
    return indexProjectSummaries(await api.listProjectSummaries());
  } catch {
    return {};
  }
}
```

In `loadProjects`, load summaries without making project opening depend on summary availability:

```ts
const [loadedProjects, loadedSummaries] = await Promise.all([
  api.listProjects(),
  loadProjectSummariesOrEmpty()
]);
setProjectSummaries(loadedSummaries);
```

After `createProject`, `deleteSavedProject`, and successful `importMarkdownPlan`, refresh summaries:

```ts
setProjectSummaries(await loadProjectSummariesOrEmpty());
```

Pass to `ProjectPicker`:

```tsx
projectSummaries={projectSummaries}
homePath=""
```

The empty `homePath` keeps runtime behavior deterministic without adding a new OS command. Component tests still pass a fake home path directly to `ProjectPicker`.

- [ ] **Step 9: Add CSS for compact metadata**

In `apps/desktop/src/styles/base.css`, replace the existing project picker row styles with:

```css
.project-picker__project {
  width: 100%;
  justify-content: space-between;
  text-align: left;
}

.project-picker__project .ui-button__label {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}

.project-picker__summary {
  display: grid;
  min-width: 0;
  gap: var(--space-1);
}

.project-picker__name {
  overflow-wrap: anywhere;
}

.project-picker__meta {
  color: var(--color-muted);
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.project-picker__delete {
  align-self: center;
  color: var(--color-muted);
}
```

- [ ] **Step 10: Run focused UI tests**

Run:

```bash
npm --workspace apps/desktop run test -- src/features/project-setup/projectMetadata.test.ts src/features/project-setup/ProjectPicker.test.tsx src/app/App.test.tsx
```

Expected: PASS after updating any App tests that still query project buttons by exact name. Use regex names such as `/First Project.*Open project/s` when the accessible name now includes metadata.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/src/features/project-setup/projectMetadata.ts apps/desktop/src/features/project-setup/projectMetadata.test.ts apps/desktop/src/features/project-setup/ProjectPicker.tsx apps/desktop/src/features/project-setup/ProjectPicker.test.tsx apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx apps/desktop/src/styles/base.css
git commit -m "feat: enrich project picker rows"
```

---

### Task 3: Refine Sidebar Hierarchy And Labels

**Files:**
- Modify: `apps/desktop/src/app/shell/AppShell.tsx`
- Modify: `apps/desktop/src/app/shell/AppShell.test.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`
- Modify: `apps/desktop/src/styles/base.css`

- [ ] **Step 1: Write failing AppShell tests**

In `apps/desktop/src/app/shell/AppShell.test.tsx`, add:

```ts
it("labels project backups without wrapping export import copy", () => {
  render(
    <AppShell activeDestination="utilities" projectName="Desclop">
      <h1>Backups</h1>
    </AppShell>
  );

  const nav = screen.getByRole("navigation", { name: "Primary" });
  expect(within(nav).getByRole("button", { name: "Backups" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  expect(within(nav).queryByRole("button", { name: "Export / Import" })).not.toBeInTheDocument();
});

it("renders switch project as a quieter project action", () => {
  render(
    <AppShell activeDestination="today" projectName="Desclop">
      <h1>Today</h1>
    </AppShell>
  );

  expect(screen.getByRole("button", { name: "Switch project" })).toHaveClass(
    "app-nav__project-action"
  );
});
```

- [ ] **Step 2: Run AppShell tests and verify they fail**

Run:

```bash
npm --workspace apps/desktop run test -- src/app/shell/AppShell.test.tsx
```

Expected: FAIL because the old label is `Export / Import` and the switch button has no lower-weight class.

- [ ] **Step 3: Update AppShell labels and classes**

In `apps/desktop/src/app/shell/AppShell.tsx`, change:

```ts
{ destination: "utilities", label: "Backups", icon: Download }
```

Change the switch button class:

```tsx
className="app-nav__button app-nav__project-action"
```

- [ ] **Step 4: Add sidebar density CSS**

In `apps/desktop/src/styles/base.css`, update:

```css
.app-sidebar {
  gap: var(--space-4);
  padding: var(--space-4);
}

.app-sidebar__identity strong {
  font-size: 1rem;
}

.app-nav {
  gap: var(--space-4);
}

.app-nav__button {
  width: 100%;
  justify-content: flex-start;
  min-height: 36px;
  padding: 7px 10px;
  white-space: nowrap;
}

.app-nav__project-action {
  margin-top: var(--space-2);
  color: var(--color-muted);
}
```

- [ ] **Step 5: Update app-level navigation expectations**

In `apps/desktop/src/app/App.test.tsx`, replace queries for `Export / Import` navigation with `Backups`. Keep the screen heading as `Export / Import` until Task 5 updates the screen title.

```ts
await user.click(screen.getByRole("button", { name: "Backups" }));
expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
```

- [ ] **Step 6: Run sidebar tests**

Run:

```bash
npm --workspace apps/desktop run test -- src/app/shell/AppShell.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/app/shell/AppShell.tsx apps/desktop/src/app/shell/AppShell.test.tsx apps/desktop/src/app/App.test.tsx apps/desktop/src/styles/base.css
git commit -m "fix: reduce sidebar maintenance weight"
```

---

### Task 4: Add Folder Picker API Wrapper

**Files:**
- Create: `apps/desktop/src/shared/api/folderDialog.ts`
- Create: `apps/desktop/src/shared/api/folderDialog.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Install dialog dependencies**

Run:

```bash
npm install @tauri-apps/plugin-dialog --workspace apps/desktop
cargo add tauri-plugin-dialog@2 --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: `package-lock.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`, and `apps/desktop/src-tauri/Cargo.lock` change.

- [ ] **Step 2: Register the Tauri dialog plugin**

In `apps/desktop/src-tauri/src/lib.rs`, add:

```rust
.plugin(tauri_plugin_dialog::init())
```

directly before:

```rust
.plugin(tauri_plugin_opener::init())
```

- [ ] **Step 3: Write failing folder dialog tests**

Create `apps/desktop/src/shared/api/folderDialog.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseFolder } from "./folderDialog";

const { open } = vi.hoisted(() => ({
  open: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));

describe("chooseFolder", () => {
  beforeEach(() => {
    open.mockReset();
  });

  it("returns the selected folder path", async () => {
    open.mockResolvedValue("/tmp/desclop-backup");

    await expect(chooseFolder()).resolves.toBe("/tmp/desclop-backup");

    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
  });

  it("returns null when the user cancels", async () => {
    open.mockResolvedValue(null);

    await expect(chooseFolder()).resolves.toBeNull();
  });

  it("returns null when dialog returns an array", async () => {
    open.mockResolvedValue(["/tmp/a", "/tmp/b"]);

    await expect(chooseFolder()).resolves.toBeNull();
  });
});
```

- [ ] **Step 4: Run folder dialog tests and verify they fail**

Run:

```bash
npm --workspace apps/desktop run test -- src/shared/api/folderDialog.test.ts
```

Expected: FAIL with a module resolution error for `./folderDialog`.

- [ ] **Step 5: Implement the wrapper**

Create `apps/desktop/src/shared/api/folderDialog.ts`:

```ts
import { open } from "@tauri-apps/plugin-dialog";

export async function chooseFolder() {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}
```

- [ ] **Step 6: Run dialog tests and build**

Run:

```bash
npm --workspace apps/desktop run test -- src/shared/api/folderDialog.test.ts
npm --workspace apps/desktop run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/package.json package-lock.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/lib.rs apps/desktop/src/shared/api/folderDialog.ts apps/desktop/src/shared/api/folderDialog.test.ts
git commit -m "feat: add folder picker wrapper"
```

---

### Task 5: Build Clear Export / Import Utility UI

**Files:**
- Modify: `apps/desktop/src/features/utilities/Utilities.tsx`
- Modify: `apps/desktop/src/features/utilities/Utilities.test.tsx`
- Modify: `apps/desktop/src/styles/base.css`

- [ ] **Step 1: Write failing Utilities component tests**

Replace `apps/desktop/src/features/utilities/Utilities.test.tsx` with:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../app/test-utils";
import { Utilities } from "./Utilities";

function renderUtilities(overrides: Partial<Parameters<typeof Utilities>[0]> = {}) {
  return renderWithRouter(
    <Utilities
      projectPath="/tmp/desclop"
      gitEnabled={true}
      gitHealth="Git unavailable."
      markdownExport="# Desclop\n\n## Foundation"
      bundleDestination=""
      bundleFolder="/tmp/desclop-bundle"
      reselectedLocalPath=""
      portableStatus={null}
      portableError={null}
      onOpenImport={vi.fn()}
      onChooseBundleDestination={vi.fn()}
      onChooseBundleFolder={vi.fn()}
      onChooseLocalProjectFolder={vi.fn()}
      onExportPortableBundle={vi.fn()}
      onImportPortableBundle={vi.fn()}
      {...overrides}
    />
  );
}

describe("Utilities", () => {
  it("explains markdown export and shows a readonly preview", () => {
    renderUtilities();

    expect(screen.getByRole("heading", { name: "Export / Import" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Markdown export" })).toBeInTheDocument();
    expect(screen.getByText("Readable Markdown for copying, sharing, or archiving the current plan.")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown preview")).toHaveValue("# Desclop\n\n## Foundation");
    expect(screen.getByLabelText("Markdown preview")).toHaveAttribute("readonly");
  });

  it("uses choose folder controls for portable export and import", async () => {
    const user = userEvent.setup();
    const onChooseBundleDestination = vi.fn();
    const onChooseBundleFolder = vi.fn();
    const onChooseLocalProjectFolder = vi.fn();

    renderUtilities({
      bundleDestination: "/tmp/backups",
      reselectedLocalPath: "/tmp/desclop",
      onChooseBundleDestination,
      onChooseBundleFolder,
      onChooseLocalProjectFolder
    });

    await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
    await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
    await user.click(screen.getByRole("button", { name: "Choose local project folder" }));

    expect(onChooseBundleDestination).toHaveBeenCalledTimes(1);
    expect(onChooseBundleFolder).toHaveBeenCalledTimes(1);
    expect(onChooseLocalProjectFolder).toHaveBeenCalledTimes(1);
  });

  it("keeps portable actions disabled until required folders are selected", () => {
    renderUtilities({
      bundleDestination: "",
      bundleFolder: "/tmp/backup",
      reselectedLocalPath: ""
    });

    expect(screen.getByRole("button", { name: "Export portable backup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import portable backup" })).toBeDisabled();
  });

  it("submits portable actions when folder selections are valid", async () => {
    const user = userEvent.setup();
    const onExportPortableBundle = vi.fn();
    const onImportPortableBundle = vi.fn();

    renderUtilities({
      bundleDestination: "/tmp/backups",
      bundleFolder: "/tmp/backup",
      reselectedLocalPath: "/tmp/desclop",
      onExportPortableBundle,
      onImportPortableBundle
    });

    await user.click(screen.getByRole("button", { name: "Export portable backup" }));
    await user.click(screen.getByRole("button", { name: "Import portable backup" }));

    expect(onExportPortableBundle).toHaveBeenCalledTimes(1);
    expect(onImportPortableBundle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run Utilities tests and verify they fail**

Run:

```bash
npm --workspace apps/desktop run test -- src/features/utilities/Utilities.test.tsx
```

Expected: FAIL because `Utilities` does not accept the new props and still renders placeholder content.

- [ ] **Step 3: Implement the Utilities props and layout**

Replace `apps/desktop/src/features/utilities/Utilities.tsx` with:

```tsx
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
```

- [ ] **Step 4: Add utility layout CSS**

In `apps/desktop/src/styles/base.css`, add:

```css
.path-picker {
  display: grid;
  gap: var(--space-2);
}

.path-picker__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
}

.path-picker__input {
  color: var(--color-muted);
}

.utilities-screen .ui-button {
  justify-self: start;
}
```

- [ ] **Step 5: Run Utilities tests**

Run:

```bash
npm --workspace apps/desktop run test -- src/features/utilities/Utilities.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/utilities/Utilities.tsx apps/desktop/src/features/utilities/Utilities.test.tsx apps/desktop/src/styles/base.css
git commit -m "feat: clarify utilities export import screen"
```

---

### Task 6: Wire Utilities Screen, Folder Selection, And Portable Flows

**Files:**
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing App tests for folder selection and portable copy**

In `apps/desktop/src/app/App.test.tsx`, add a mock:

```ts
vi.mock("../shared/api/folderDialog", () => ({
  chooseFolder: vi.fn()
}));
```

Import it:

```ts
import { chooseFolder } from "../shared/api/folderDialog";
```

Add:

```ts
const chooseFolderMock = vi.mocked(chooseFolder);
```

In `afterEach`, add:

```ts
chooseFolderMock.mockReset();
```

Add this test:

```ts
it("chooses folders for portable export and import", async () => {
  const user = userEvent.setup();
  enableTauriApi();
  listProjects.mockResolvedValue([projectFixture()]);
  getResumeBrief.mockResolvedValue(emptyResumeBrief());
  loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
  chooseFolderMock
    .mockResolvedValueOnce("/tmp/backups")
    .mockResolvedValueOnce("/tmp/backups/desclop")
    .mockResolvedValueOnce("/tmp/desclop");

  renderWithRouter(<App />);

  await user.click(await screen.findByRole("button", { name: "Backups" }));
  await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
  await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
  await user.click(screen.getByRole("button", { name: "Choose local project folder" }));

  expect(screen.getByLabelText("Destination folder")).toHaveValue("/tmp/backups");
  expect(screen.getByLabelText("Backup folder")).toHaveValue("/tmp/backups/desclop");
  expect(screen.getByLabelText("Local project folder")).toHaveValue("/tmp/desclop");
});
```

Add this test:

```ts
it("exports and imports portable backups with visible feedback", async () => {
  const user = userEvent.setup();
  const importedProject = projectFixture({ id: "p2", name: "Imported Project", localPath: "/tmp/desclop" });
  enableTauriApi();
  listProjects
    .mockResolvedValueOnce([projectFixture()])
    .mockResolvedValueOnce([projectFixture(), importedProject]);
  getResumeBrief.mockImplementation(async (projectId) => emptyResumeBrief(projectId));
  loadProjectPlan.mockResolvedValue(importedPlanFixture("p1"));
  exportProjectBundle.mockResolvedValue("/tmp/backups/desclop");
  importProjectBundle.mockResolvedValue("p2");
  chooseFolderMock
    .mockResolvedValueOnce("/tmp/backups")
    .mockResolvedValueOnce("/tmp/backups/desclop")
    .mockResolvedValueOnce("/tmp/desclop");

  renderWithRouter(<App />);

  await user.click(await screen.findByRole("button", { name: "Backups" }));
  await user.click(screen.getByRole("button", { name: "Choose destination folder" }));
  await user.click(screen.getByRole("button", { name: "Export portable backup" }));

  expect(exportProjectBundle).toHaveBeenCalledWith("p1", "/tmp/backups");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Exported portable backup to /tmp/backups/desclop"
  );

  await user.click(screen.getByRole("button", { name: "Choose backup folder" }));
  await user.click(screen.getByRole("button", { name: "Choose local project folder" }));
  await user.click(screen.getByRole("button", { name: "Import portable backup" }));

  expect(importProjectBundle).toHaveBeenCalledWith("/tmp/backups/desclop", "/tmp/desclop");
  expect(await screen.findByRole("alert")).toHaveTextContent("Imported portable project.");
});
```

- [ ] **Step 2: Run App tests and verify they fail**

Run:

```bash
npm --workspace apps/desktop run test -- src/app/App.test.tsx
```

Expected: FAIL because `App.tsx` still renders inline forms and does not call `chooseFolder`.

- [ ] **Step 3: Import Utilities and folder picker in App**

In `apps/desktop/src/app/App.tsx`, add:

```ts
import { Utilities } from "../features/utilities/Utilities";
import { chooseFolder } from "../shared/api/folderDialog";
```

Remove `type FormEvent` from the React import when form submits are removed.

- [ ] **Step 4: Replace form submit handlers with button handlers**

Change:

```ts
async function exportPortableBundle(event: FormEvent) {
  event.preventDefault();
```

to:

```ts
async function exportPortableBundle() {
```

Change the empty destination message:

```ts
setPortableError("Destination folder is required.");
```

Change the success message:

```ts
setPortableStatus(`Exported portable backup to ${exportedPath}`);
```

Change:

```ts
async function importPortableBundle(event: FormEvent) {
  event.preventDefault();
```

to:

```ts
async function importPortableBundle() {
```

Change the empty import message:

```ts
setPortableError("Backup folder and local project folder are required.");
```

- [ ] **Step 5: Add choose-folder handlers**

Add in `App.tsx` near portable handlers:

```ts
async function chooseBundleDestination() {
  const selected = await chooseFolder();
  if (selected) {
    setBundleDestination(selected);
    setPortableError(null);
  }
}

async function chooseBundleFolder() {
  const selected = await chooseFolder();
  if (selected) {
    setBundleFolder(selected);
    setPortableError(null);
  }
}

async function chooseLocalProjectFolder() {
  const selected = await chooseFolder();
  if (selected) {
    setReselectedLocalPath(selected);
    setPortableError(null);
  }
}
```

- [ ] **Step 6: Render Utilities instead of inline utility markup**

Replace the `if (screen === "utilities" && project) { return (...) }` block in `renderProjectScreen()` with:

```tsx
if (screen === "utilities" && project) {
  return (
    <Utilities
      projectPath={project.localPath}
      gitEnabled={project.gitEnabled}
      gitHealth={gitError}
      markdownExport={markdownExport}
      bundleDestination={bundleDestination}
      bundleFolder={bundleFolder}
      reselectedLocalPath={reselectedLocalPath}
      portableStatus={portableStatus}
      portableError={portableError}
      onOpenImport={() => setScreen("import")}
      onChooseBundleDestination={() => void chooseBundleDestination()}
      onChooseBundleFolder={() => void chooseBundleFolder()}
      onChooseLocalProjectFolder={() => void chooseLocalProjectFolder()}
      onExportPortableBundle={() => void exportPortableBundle()}
      onImportPortableBundle={() => void importPortableBundle()}
    />
  );
}
```

- [ ] **Step 7: Run App tests**

Run:

```bash
npm --workspace apps/desktop run test -- src/app/App.test.tsx
```

Expected: PASS after updating old assertions for field labels:

- `Bundle destination folder` -> `Destination folder`
- `Bundle folder` -> `Backup folder`
- `Reselected local folder path` -> `Local project folder`
- `Export portable bundle` -> `Export portable backup`
- `Import portable bundle` -> `Import portable backup`

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "feat: wire portable backup utilities"
```

---

### Task 7: Full Verification And Manual QA

**Files:**
- Read: `docs/superpowers/specs/2026-06-16-desclop-new-features-and-fixes.md`
- Verify: full app tests and build

- [ ] **Step 1: Run the full frontend test suite**

Run:

```bash
npm --workspace apps/desktop run test
```

Expected: PASS.

- [ ] **Step 2: Run Rust tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm --workspace apps/desktop run build
```

Expected: PASS.

- [ ] **Step 4: Run e2e smoke tests**

Run:

```bash
npm --workspace apps/desktop run test:e2e
```

Expected: PASS, or document the exact failing browser/environment reason if Playwright cannot launch.

- [ ] **Step 5: Manual verification for project picker**

Run the app:

```bash
npm run dev
```

Manual checks:

- Open the saved-project picker with two projects that have similar names.
- Confirm each row shows project name, path, updated date, and state metadata.
- Confirm the primary `Open project` action is the dominant click target.
- Confirm `Delete` is visually quieter than `Open project`.
- Confirm the delete confirmation still names the project and says local project files are not deleted.

- [ ] **Step 6: Manual verification for sidebar**

Manual checks:

- Confirm `Today`, `Plan`, and `Timeline` remain the most scannable Work destinations.
- Confirm `Capture` remains prominent.
- Confirm the Project group uses `Import Plan`, `Backups`, and a quieter `Switch project`.
- Confirm no sidebar label wraps in the default 800x600 Tauri window.

- [ ] **Step 7: Manual verification for export/import**

Manual checks:

- Go to `Backups`.
- Confirm the screen heading is `Export / Import`.
- Confirm `Markdown export`, `Export portable backup`, and `Import portable backup` are separate sections.
- Confirm `Markdown preview` is readonly and contains project title, stages, tasks, and checklist content for an imported plan.
- Confirm portable bundle copy says bundles include Desclop workflow data only and do not copy source code.
- Choose a destination folder and export a portable backup.
- Confirm success feedback shows the exported backup path.
- Inspect the exported folder and confirm it does not contain the source code repository.
- Choose the backup folder and a local project folder, import the backup, and confirm success feedback.
- Confirm the imported project appears or opens and points to the selected local project folder.

- [ ] **Step 8: Self-review against the spec**

Spec coverage:

- Project picker: Task 1 and Task 2 cover path, updated date, lightweight state, primary open action, quieter delete action, and no details screen.
- Sidebar: Task 3 covers structure retention, shorter `Backups` label, lower-weight `Switch project`, and density tweaks.
- Export/import: Task 4 through Task 6 cover section naming, helper copy, readonly path fields, choose-folder controls, source-code boundary copy, Markdown preview labeling, disabled actions until valid folder selection, and success/error feedback.
- Manual verification: Task 7 covers the three required flows separately.

Placeholder scan:

- No forbidden placeholder phrases or unspecified validation steps remain.

Type consistency:

- Backend `ProjectSummary` serializes as `projectId`, `taskCount`, `openInboxCount`, and `activeTaskTitle`.
- Frontend `ProjectSummary` uses the same property names.
- UI uses `bundleDestination`, `bundleFolder`, and `reselectedLocalPath` consistently from `App.tsx` through `Utilities.tsx`.

- [ ] **Step 9: Final commit**

```bash
git status --short
git add docs/superpowers/plans/2026-06-16-desclop-new-features-and-fixes.md
git commit -m "docs: plan desclop feature fixes"
```
