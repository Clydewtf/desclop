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
- Planner view with stage frames and task progress.
- Task details with notes, checklist, work entries, linked commits, inbox items, and next step.
- Manual inbox capture for bugs, ideas, questions, notes, and task candidates.
- Work review for capturing what was done, what remains, and what should happen next.
- Optional Focus Mode with ambient and timebox sessions.
- Read-only Git integration for recent commits and task context.
- Markdown export for readable project workflow snapshots.
- Portable bundle export/import for moving Desclop workflow data without copying source code.

## Project Status

Desclop is currently in alpha.

The current release line is `v0.1.0-alpha.2`, focused on creating a first local project and importing a first plan without guesswork. Expect rough edges, missing polish, and possible changes to workflows while the product shape is still settling.

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

macOS may warn about an unidentified developer if the build is not signed and notarized yet.

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

## MVP Boundaries

- Project workflow data stays local.
- Git integration is read-only.
- Focus Mode is optional.
- Markdown export is readable, not a full-fidelity backup.
- Portable bundles transfer workflow data and do not copy source code.
- License state is isolated from project data.
