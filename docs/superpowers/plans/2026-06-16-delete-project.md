# Delete Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users remove a saved project and all project-owned SQLite data from the Switch project screen without deleting the local project directory.

**Architecture:** SQLite remains the source of truth and performs dependent cleanup through existing `ON DELETE CASCADE` constraints. A thin Tauri command and frontend API method expose the operation. `ProjectPicker` owns confirmation UI while `App` owns request deduplication, list/context updates, fallback project loading, and user-facing errors.

**Tech Stack:** Rust, rusqlite, Tauri 2, React, TypeScript, Vitest, Testing Library, Playwright.

---

### Task 1: SQLite Repository And Tauri Command

**Files:**
- Modify: `apps/desktop/src-tauri/src/repositories/projects.rs`
- Modify: `apps/desktop/src-tauri/src/commands/projects.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing repository tests**

Add tests that create two projects plus rows in `stages`, `tasks`, `checklist_items`, `notes`, `work_entries`, `inbox_items`, `commits`, `commit_task_links`, and `resume_briefs`. Delete the first project and assert every first-project row is gone while every second-project row remains. Create a real temporary folder/file for the deleted project and assert both still exist after database deletion. Add a missing-ID assertion:

```rust
assert!(repo.delete_project("missing-project").is_err());
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd apps/desktop/src-tauri && cargo test repositories::projects::tests::delete_project -- --nocapture`

Expected: compilation failure because `ProjectRepository::delete_project` does not exist.

- [ ] **Step 3: Implement repository deletion**

Add the minimal method and return `QueryReturnedNoRows` when no row was deleted:

```rust
pub fn delete_project(&self, project_id: &str) -> rusqlite::Result<()> {
    let deleted = self.conn.execute(
        "delete from projects where id = ?1",
        params![project_id],
    )?;
    if deleted == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}
```

- [ ] **Step 4: Verify repository GREEN**

Run: `cd apps/desktop/src-tauri && cargo test repositories::projects::tests::delete_project -- --nocapture`

Expected: all focused deletion tests pass.

- [ ] **Step 5: Add and register the Tauri command**

Add the thin command:

```rust
#[tauri::command]
pub fn delete_project(project_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    ProjectRepository::new(&conn)
        .delete_project(&project_id)
        .map_err(|err| err.to_string())
}
```

Register `commands::projects::delete_project` in `tauri::generate_handler!`.

- [ ] **Step 6: Run Rust tests**

Run: `cd apps/desktop/src-tauri && cargo test`

Expected: all Rust tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/repositories/projects.rs apps/desktop/src-tauri/src/commands/projects.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: delete projects from sqlite"
```

### Task 2: Frontend API And Picker Confirmation

**Files:**
- Modify: `apps/desktop/src/shared/api/client.ts`
- Create: `apps/desktop/src/shared/api/client.test.ts`
- Modify: `apps/desktop/src/features/project-setup/ProjectPicker.tsx`
- Create: `apps/desktop/src/features/project-setup/ProjectPicker.test.tsx`
- Modify: `apps/desktop/src/styles/base.css`

- [ ] **Step 1: Write failing API and picker tests**

Test that `api.deleteProject("p1")` invokes `delete_project` with `{ projectId: "p1" }`. Render two projects and verify clicking a row-level `Delete` does not call `onOpenProject`, opens a dialog containing:

```text
Delete “Desclop Manual QA” from Desclop? Local project files will not be deleted.
```

Verify `Cancel` closes the dialog without calling `onDeleteProject`, and `Delete project` calls `onDeleteProject(project)` once. Verify the confirm button is disabled while that project is deleting.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run: `npm --workspace apps/desktop run test -- src/shared/api/client.test.ts src/features/project-setup/ProjectPicker.test.tsx`

Expected: failures because the API method, picker props, and confirmation UI do not exist.

- [ ] **Step 3: Implement API and picker**

Add:

```ts
deleteProject: (projectId: string) =>
  invoke<void>("delete_project", { projectId }),
```

Extend picker props with:

```ts
onDeleteProject: (project: Project) => void | Promise<void>;
deletingProjectId: string | null;
deleteError: string | null;
```

Render each project inside a row with separate Open and Delete buttons. Keep confirmation state local to `ProjectPicker`, use a semantic `role="dialog"`, and render `Cancel` plus `Delete project`. Keep the dialog open on deletion error so the error can be shown without losing context.

- [ ] **Step 4: Verify focused frontend GREEN**

Run: `npm --workspace apps/desktop run test -- src/shared/api/client.test.ts src/features/project-setup/ProjectPicker.test.tsx`

Expected: focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/api/client.ts apps/desktop/src/shared/api/client.test.ts apps/desktop/src/features/project-setup/ProjectPicker.tsx apps/desktop/src/features/project-setup/ProjectPicker.test.tsx apps/desktop/src/styles/base.css
git commit -m "feat: confirm project deletion in picker"
```

### Task 3: App Deletion State And Fallback Navigation

**Files:**
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing App integration tests**

Add `api.deleteProject` to the client mock and cover:

```text
successful deletion removes the project from the saved list
deleting the current project clears stale context and loads the next saved project
deleting the last project shows Create a local project
failed deletion leaves the project visible and shows Could not delete project.
two rapid confirmations while pending make exactly one API call
```

- [ ] **Step 2: Run focused App tests and verify RED**

Run: `npm --workspace apps/desktop run test -- src/app/App.test.tsx`

Expected: new tests fail because `App` does not pass deletion props or manage deletion state.

- [ ] **Step 3: Implement App deletion flow**

Add `deletingProjectId`, `deleteError`, and a ref-backed synchronous in-flight guard. Guard before awaiting:

```ts
if (deleteInFlightRef.current) return;
deleteInFlightRef.current = true;
setDeletingProjectId(projectToDelete.id);
```

After `api.deleteProject` succeeds, remove the project from state. If it was current, invalidate and reset project context. Load the first remaining project with `loadProjectIntoState`; if none remain, switch to creation mode. On failure, preserve the list and set `Could not delete project.`. Clear both the ref guard and pending ID in `finally`, and pass all deletion props to `ProjectPicker`.

- [ ] **Step 4: Verify focused App GREEN**

Run: `npm --workspace apps/desktop run test -- src/app/App.test.tsx`

Expected: all App tests pass.

- [ ] **Step 5: Run complete verification**

Run:

```bash
npm run test -- --run
cd apps/desktop/src-tauri && cargo test
npm run test:e2e
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "feat: update app state after project deletion"
```
