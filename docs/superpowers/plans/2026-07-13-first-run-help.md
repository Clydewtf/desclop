# First-run help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal first-run help dialog that appears once and remembers dismissal.

**Architecture:** Add a focused onboarding dialog and a small browser-storage boundary. Mount the dialog from the app shell after loading so it works both before and after project selection. Keep all copy and behavior local to the desktop frontend.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing CSS and shared `Button` component.

## Global Constraints

- The dialog is shown only after the initial loading state has finished.
- The dismissed state is persisted in `localStorage`.
- Closing the dialog hides it immediately and prevents it from showing on a later app mount.
- The first version contains only welcome/help content for Today, Plan, Timeline, and Capture.
- Do not add a backend command, database migration, settings screen, or unrelated navigation changes.

---

### Task 1: Add and mount first-run help

**Files:**
- Create: `apps/desktop/src/features/onboarding/FirstRunHelp.tsx`
- Create: `apps/desktop/src/features/onboarding/FirstRunHelp.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`
- Modify: `apps/desktop/src/styles/base.css`

**Interfaces:**
- `FirstRunHelp` owns the visibility check and dismissal persistence, and exposes no backend API.
- `App` mounts the dialog only for loaded app states, including project setup.

- [ ] **Step 1: Write failing tests**

  Test that a fresh storage state renders an accessible dialog with the four requested areas and that its dismiss button removes it. Test that a persisted dismissal renders no dialog on a later mount. Keep app-level tests isolated by clearing the onboarding storage key in setup/teardown.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run: `npm --workspace apps/desktop run test -- src/features/onboarding/FirstRunHelp.test.tsx src/app/App.test.tsx`
  Expected: the new onboarding assertions fail because the dialog is not implemented.

- [ ] **Step 3: Implement the minimal dialog and persistence**

  Add the accessible modal using existing button styles and a stable storage key. Read storage defensively, render the dialog after loading, and write the dismissal marker before hiding it. Add only the CSS needed for the centered overlay and responsive content.

- [ ] **Step 4: Run focused and full verification**

  Run: `npm --workspace apps/desktop run test -- src/features/onboarding/FirstRunHelp.test.tsx src/app/App.test.tsx`
  Expected: focused tests pass.

  Run: `npm test`
  Expected: all existing and new tests pass.

  Run: `npm --workspace apps/desktop run build`
  Expected: TypeScript and Vite build pass.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/desktop/src/features/onboarding apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx apps/desktop/src/styles/base.css
  git commit -m "feat: add first-run help dialog"
  ```
