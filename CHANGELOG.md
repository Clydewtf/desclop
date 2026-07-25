# Changelog

All notable changes to Desclop are documented in this file.

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
