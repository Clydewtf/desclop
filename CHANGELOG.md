# Changelog

All notable changes to Desclop are documented in this file.

## v0.2.0-beta.1 - 2026-07-26

Controlled manual AI context export.

### Added

- A local Markdown context export with explicit Project, Plan, Task, Next action, recent work reviews, Notes, and Related commits fields.
- Per-field preview, exclusion, local editing, and manual clipboard copy before any data leaves the app.

### Intentionally not included

- AI summary generation, model calls, API keys, background sending, cloud accounts, or automatic context uploads.

## v0.1.0-beta.1 - 2026-07-26

Beta release readiness pass.

### Added

- Safe UI error boundaries, opaque error references, and non-technical recovery messages for critical local failures.
- A reproducible browser smoke path covering diagnostics, portable backup/restore, and close behavior controls.
- A release workflow `mode=check` that validates versions and builds expected bundles without publishing artifacts.
- Native smoke and beta feedback checklists that document platform-specific signing, installer, runtime, and fallback limits.

### Release limits

- macOS signing/notarization and Windows code signing are not configured in the current workflow.
- Windows WebView2 offline/fixed-runtime packaging is not configured.
- Linux validation uses Ubuntu 22.04 as the build baseline; wider distro coverage remains manual.
- The beta has no automatic in-app updater; updates and fallback are manual.

## v0.1.0-alpha.4 - 2026-07-25

Local reflection alpha release.

### Added

- A compact Weekly Review for the last seven local days, with completed tasks, open captures, tasks without a next action, work reviews, and inspectable activity by day.
- Resume readiness that checks the active task, its concrete next action, and a recent work review before suggesting how to continue.
- Direct paths from review metrics and activity records back to their local task, timeline, or source context.
- Locally recorded task completion timestamps, including preservation in portable bundles, so new completions can be counted by review period.
- An optional setting to hide explanatory text once the local workflow is familiar.

### Changed

- Synchronized npm, Cargo, and Tauri app versions at `0.1.0-alpha.4`.

## v0.1.0-alpha.3 - 2026-07-25

Daily comfort and multi-plan clarity alpha release.

### Added

- Persistent local application settings for System/Light/Dark appearance, density, compact sidebar, interface size, window resizing, close behavior, and the Capture shortcut.
- Explicit tray-or-quit window behavior, a direct Quit action, and a safe minimum desktop window size.
- A multi-plan Plan map that identifies the current working plan, supports reversible local hiding of completed plans, and lets people collapse plans and stages.

### Changed

- Plan now prioritizes the active or nearest recommended plan and retains the next recommended task in compact views.
- Synchronized npm, Cargo, and Tauri app versions at `0.1.0-alpha.3`.

## v0.1.0-alpha.2 - 2026-07-25

First-project and guided-import alpha release.

### Added

- A required quality gate for frontend unit tests, e2e tests, Rust tests, Clippy, and Rust formatting before release builds.
- Native local-folder selection and validation during project setup, with Git detection as an optional hint.
- Guided Markdown import with a copyable template, line-level warnings, import counts, fallback plan names, and a persistent import action.
- Resumable first-run guidance with contextual setup/import hints and a reusable Help & plan example entry point.

### Changed

- Markdown imports always add a new plan and preserve existing plans, tasks, notes, and history.
- Synchronized npm, Cargo, and Tauri app versions at `0.1.0-alpha.2`.

## v0.1.0-alpha.1 - 2026-07-07

First alpha release for the resume-first desktop MVP.

### Added

- Multiple-plan workspace support and richer planner data model.
- Resume and timeline improvements for continuing work with project context.
- Git commit linking improvements for task and work history.
- Tray/window-state support for the desktop shell.
- Markdown import and planner parsing refinements.

### Changed

- Expanded the default desktop window size for the alpha UI.
- Updated planner, timeline, and Today flows for the current MVP direction.

### Release

- Synchronized npm, Cargo, and Tauri app versions at `0.1.0-alpha.1`.
- Added GitHub Actions release publishing for `v*` tags.
