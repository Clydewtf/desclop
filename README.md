# Desclop

Desclop is a desktop-only, local-first workspace for developers who want to resume coding without losing context.

It helps you keep a project plan, task context, notes, lightweight work history, Git activity, and next steps in one local desktop app. The main idea is simple: when you return to a project, Desclop should help you understand where you stopped and what to do next.

## Who It Is For

Desclop is built for individual developers working on local coding projects:

- solo developers and indie hackers;
- freelancers and students;
- developers working on pet projects;
- developers who use AI heavily and need to preserve project context between sessions.

It is not meant to be a team project management system, a full Git client, a time tracker, or a replacement for issue trackers like Jira.

## Features

- Resume-first workspace centered on "continue where you left off".
- Local project workflow data stored on your machine.
- Markdown plan import with stages, tasks, and checklists.
- Native local-file plan import for `.md`, `.markdown`, and `.txt` files.
- Planner view with stage frames and task progress.
- Explicit Edit plan mode for safely changing plans, stages, tasks, checklists, and their order.
- Task details with notes, checklist, work entries, linked commits, inbox items, and next step.
- Manual inbox capture for bugs, ideas, questions, notes, and task candidates.
- Work review for capturing what was done, what remains, and what should happen next.
- Optional Focus Mode with ambient and timebox sessions.
- Read-only Git integration for recent commits and task context.
- Markdown export for readable project workflow snapshots.
- Portable bundle export/import for moving Desclop workflow data without copying source code.

## Project Status

Desclop is currently in beta.

The current release line is `v0.2.0-beta.2`, focused on safe local plan import and editing while keeping Today and Resume Brief in sync. Expect rough edges and platform-specific limitations while the beta is being validated.

## Installation

Prebuilt desktop builds are published through GitHub Releases.

To install Desclop:

1. Open the latest release on GitHub.
2. Download the asset for your operating system.
3. Use the platform package, not the automatically generated `Source code` archives.

Typical release assets are:

- macOS: `.dmg` or macOS app archive;
- Linux: `.AppImage` or `.deb`;
- Windows: `.exe` installer.

The beta packages are not currently signed/notarized. macOS may warn about an unidentified developer, and Windows may show SmartScreen publisher warnings. The Windows installer may need internet access to obtain WebView2. The owner-only beta release pack is kept locally in the ignored `release-private/beta/` folder and is distributed to testers separately.

## Development

Install dependencies:

```bash
npm install
```

Start the desktop frontend in development mode:

```bash
npm run dev
```

Run Tauri commands through the workspace script:

```bash
npm run tauri -- <command>
```

## Building

Build the desktop application with Tauri:

```bash
npm run tauri -- build
```

The desktop app lives in `apps/desktop`.

## Verification

Run unit and integration tests:

```bash
npm run test -- --run
```

Run Rust tests:

```bash
cd apps/desktop/src-tauri
cargo test
```

Run end-to-end tests:

```bash
npm run test:e2e
```

## Releases

Release builds are handled by GitHub Actions.

When a version tag is published, the release workflow builds desktop packages for macOS, Linux, and Windows, then uploads the generated Tauri assets to the GitHub Release.

The workflow can also be started manually for a specific release tag and platform.

Use manual `mode=check` with the expected `tag` and a `source_ref` branch/commit to build and verify release bundles without creating or uploading a GitHub Release. The check keeps short-lived GitHub Actions artifacts available for manual native smoke; it does not create release assets. Use `mode=publish` only after the three-platform native smoke checklist is signed off. Distribute the private beta feedback guide to testers and ask them to share only the support report, not project files.

## MVP Boundaries

- Project workflow data stays local.
- Git integration is read-only.
- Focus Mode is optional.
- Markdown export is readable, not a full-fidelity backup.
- Portable bundles transfer workflow data and do not copy source code.
- License state is isolated from project data.
