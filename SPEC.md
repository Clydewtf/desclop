# Desclop Resume-First MVP Design

Date: 2026-05-20
Status: Draft for user review

## 1. Product Frame

Desclop is a desktop-only, local-first workspace for developers that helps them resume coding without losing context.

The MVP is not positioned as a generic productivity app, todo list, Git client, or time tracker. Its main product promise is:

> Desclop helps developers return to code without losing context.

The primary UX hook is the Resume Brief. When a developer opens Desclop, the app should answer:

- what they were working on;
- where they stopped;
- what the latest note was;
- which commits appeared;
- what the next step is;
- how to continue quickly.

The UX priority is:

1. Work context.
2. Project plan.
3. Work history.

The main screen follows a Resume-first direction. The user should first see "Continue where you left off", then the current task, current stage, next step, latest notes, latest Git activity, and nearby tasks from the plan.

Focus Mode is optional. It is a working atmosphere and time awareness mode, not a required time tracking system. If the user enables it, Desclop can record accurate time for a task or stage. If they do not enable it, the product still works through tasks, notes, statuses, Git activity, manual work entries, and Resume Brief data.

## 2. Target User State

The first version is designed for an individual developer working on local coding projects. The user may be a solo developer, indie hacker, student, freelancer, AI-heavy developer, or pet-project builder.

The more important shared state is:

- they work alone or mostly alone;
- they have one or more local coding projects;
- they have a plan, notes, commits, and unfinished work;
- they often need to remember what they were doing before continuing;
- they want to spend less time warming up and more time coding.

The MVP should not target team project management.

## 3. Positioning

Primary positioning:

> A local-first desktop workspace that helps developers resume coding without losing context.

Russian positioning:

> Desclop помогает возвращаться к коду без потери контекста.

Supporting hooks:

- Turn an AI-generated or Markdown project plan into a real development workflow.
- See what actually happened in your project through tasks, notes, Git commits, and work history.
- Use Focus Mode when you want a calm coding session, without making time tracking mandatory.

Recommended demo flow:

1. Import a Markdown project plan.
2. Work on a task.
3. Desclop collects notes, Git activity, inbox captures, and optional focus time.
4. The next day, Today shows a Resume Brief.
5. The user presses Continue and resumes work.

Product tone should be pragmatic and calm, with human but not overly emotional copy.

## 4. Core Entities

### Project

A local development project. It contains:

- name;
- local folder path;
- optional connected Git repository;
- project plan;
- stages;
- tasks;
- notes;
- inbox items;
- work log;
- Resume Brief data;
- import/export settings.

### Plan And Stage

The project plan is not just a Markdown file displayed inside the app. It is a development route represented as Stage Frames.

Each stage is a frame in the project route:

- completed stages are collapsed by default;
- the current stage is expanded and prominent;
- future stages remain visible as direction, but do not dominate the workspace;
- the user can reopen completed stages when needed.

This keeps the plan useful without turning the app into a heavy project management board.

### Task

Task is the main unit of work.

A task may include:

- title;
- description;
- stage;
- status;
- checklist;
- notes;
- optional priority;
- optional due date;
- linked work entries;
- linked Git commits;
- optional focus time;
- next step / resume data.

The MVP structure is:

> Stage -> Task -> Checklist

The data model should leave room for later:

> Stage -> Task -> Subtask -> Checklist

Subtasks as standalone entities are not part of the MVP.

### Work Entry

A work entry is a fact of work, not just a timer record.

It may be created from:

- Focus Mode;
- a manual work entry;
- task status changes;
- notes;
- inbox triage;
- Git commits;
- Git-assisted recovery.

A work entry can include:

- task;
- project;
- start/end time if known;
- duration if tracked;
- notes;
- linked commits;
- changed files from linked commits;
- task status changes;
- next step.

### Focus Mode

Focus Mode is optional. It can run as:

- no-limit ambient mode;
- timebox mode.

It should show:

- current task;
- timer or elapsed time;
- checklist;
- quick notes;
- capture inbox;
- calm visual animation;
- finish/pause controls.

Focus Mode improves time awareness and work history, but Desclop should remain useful without it.

### Inbox Item

Inbox is a fast capture system for thoughts that should not interrupt coding.

An inbox item can be untyped or marked as:

- bug;
- idea;
- question;
- note;
- task candidate.

Later, the user can triage an inbox item by:

- attaching it to the current task;
- converting it into a new task;
- keeping it as a note;
- deleting it.

AI triage can be added later, but MVP triage should work manually.

### Resume Brief

Resume Brief is the central UX artifact.

It is built from:

- active or last task;
- current stage;
- latest notes;
- work entries;
- inbox captures;
- linked Git commits;
- changed file metadata;
- next step.

In the MVP, Resume Brief is semi-automatic. Desclop shows facts and asks the user to help capture what was done, what remains, and what the next step is. Later, AI can generate the brief automatically.

## 5. Main Screens

### Today

Today is the main entry point.

Top priority is "Continue where you left off". It should show:

- active or last task;
- current stage;
- latest note;
- recent linked commits;
- changed files if useful;
- next step;
- action to continue.

Below that, Today can show:

- today's focus;
- next 2-3 tasks;
- recent Git activity;
- lightweight daily progress.

Today should not become a dense dashboard.

### Planner

Planner displays the project plan as Stage Frames.

It should support:

- collapsed completed stages;
- expanded current stage;
- visible future stages;
- task statuses;
- task checklists;
- stage progress;
- quick access to task detail;
- continue/open task actions.

### Task Detail

Task Detail is the center of task context.

It should include:

- description;
- checklist;
- notes;
- linked work entries;
- linked commits;
- changed file metadata;
- inbox items related to the task;
- optional focus time;
- next step;
- controls to update status or start Focus Mode.

### Focus Mode

Focus Mode is a focused working surface. It can be full-screen or nearly full-screen.

It includes:

- current task;
- timer or timebox;
- checklist;
- quick note input;
- capture inbox;
- calm visual animation;
- finish/pause controls.

### Session / Work Review

Work Review appears after Focus Mode or when the user adds a manual work entry.

This screen needs separate UX design before implementation. The MVP version should stay compact.

Minimum fields:

- what was done;
- what remains;
- next step.

It may also show:

- time spent;
- notes;
- captured inbox items;
- commits from the period;
- changed files from commits;
- task status update.

This screen is important because it creates high-quality Resume Brief data.

### Timeline

Timeline shows the history of a day or week.

It can include:

- work entries;
- linked commits;
- notes;
- inbox triage;
- task status changes;
- completed tasks;
- daily summary.

Timeline is a history view, not the primary entry point.

### Inbox

Inbox supports quick capture from Today, Task Detail, and Focus Mode.

It should support basic triage into task, note, attachment to existing task, or deletion.

## 6. Data Flows

### Project Creation

The user creates a project, gives it a name, selects a local folder, and optionally connects the local Git repository.

Desclop should work even if Git is not connected.

### Markdown Import

Markdown import follows Template + Preview.

Desclop should:

- provide a recommended Markdown format;
- parse close variants;
- show a preview before importing;
- let the user review stages, tasks, and checklists before saving;
- warn about ambiguous or unimported sections.

Recommended mapping:

- headings become stages;
- checkboxes become tasks;
- nested checkboxes or list items become checklist items.

AI is not required for MVP import. Later, AI can accept more chaotic plans and transform them into the recommended format.

### Markdown Export

Desclop should export readable project plans and summaries to Markdown.

Markdown export is for readability, GPT workflows, documentation, and sharing. It is not the full-fidelity backup format.

### Portable Project Export / Import

Local-first should not mean locked to one machine.

The MVP should support portable export/import:

- export a project backup as a `.desclop` archive or folder bundle;
- include project metadata, stages, tasks, statuses, notes, inbox, work log, linked commit metadata, and Resume Brief data;
- do not copy the source code repository;
- store path, remote info, and commit SHAs where useful;
- on another computer, let the user import the backup and reselect the local project folder;
- if the Git repository exists, try to match commit metadata by SHA.

Markdown export remains separate from project backup.

### Working On A Task

The user opens Today or Planner, selects a task, reviews context, and continues.

They may enable Focus Mode, but are not required to.

If Focus Mode is enabled:

- Desclop records accurate time;
- commits can be linked by focus interval;
- Work Review can summarize the session.

If Focus Mode is not enabled:

- the active task still exists;
- notes and status changes still update context;
- new commits can be linked to the active task;
- the user can add manual work entries.

### Git Sync And Commit Linking

Git integration in MVP is read-only.

Desclop should read:

- current branch;
- commits;
- commit timestamps;
- changed files from commits;
- commit SHAs and messages.

Commit auto-linking rule:

1. Focus interval first.
2. Active task fallback.

If a commit happens during a Focus Mode interval, Desclop links it to that task. If there is no focus interval, Desclop links new commits to the active task when reasonable.

Linked commits should be marked as auto-linked. The user can manually correct links by moving or unlinking a commit.

Manual correction is a safety mechanism, not the primary workflow.

### Resume Brief Generation

Resume Brief combines:

- current/last task;
- current stage;
- latest notes;
- work entries;
- linked commits;
- changed file metadata;
- inbox captures;
- next step.

The MVP should not depend on AI. It should use semi-automatic facts plus user-written next-step fields.

## 7. Error States And Boundaries

### No Project

Show a clear start flow:

- create project;
- select local folder;
- import Markdown or create a plan manually.

### No Git Repository

Desclop still works.

Resume Brief uses tasks, notes, inbox, statuses, manual entries, and optional Focus Mode data.

### Markdown Parse Problems

Markdown import should never silently create a bad plan.

The user must see a preview and warnings for ambiguous sections.

### Wrong Commit Link

Auto-linked commits must be editable.

The user can unlink a commit or move it to another task.

### Focus Mode Not Used

This is not an error.

The app should avoid implying that the user did something wrong. It should simply omit exact time or show "time not tracked".

### Git Operation Boundaries

MVP does not perform Git actions such as push, commit, stage, merge, rebase, or conflict resolution.

Lightweight Git actions such as push, commit helper, diff viewer, file open in IDE, branch-task links, and PR info can be considered later.

### Local-First Boundaries

No team spaces, roles, permissions, cloud sync, or account-dependent project data in MVP.

Portable export/import provides manual portability without cloud sync.

## 8. Monetization And Accounts

Desclop should remain local-first even if monetized.

Project data should remain local:

- projects;
- plans;
- tasks;
- notes;
- inbox;
- work log;
- Git links;
- Resume Brief data.

The app can have a separate License / Entitlements Layer for payment and access control.

This layer may include:

- email/login or license key;
- trial state;
- Founder License state;
- future subscription entitlement state;
- device activation if needed;
- offline grace period.

The account should not become central to daily UX. It exists for licensing, not project management.

Go-to-market direction:

1. Closed free beta to validate the core loop.
2. Paid Founder License as a one-time license for early users.
3. Hybrid model later, where local core features remain in the paid desktop app and AI/services/integrations can become subscription features.

Early users can receive founder benefits, discounts, or grandfathered access to core local features.

## 9. MVP Scope

### In Scope

- Desktop-only, local-first application.
- Project creation and local folder linking.
- Optional local Git repository connection.
- Markdown import via Template + Preview.
- Markdown export for plans and summaries.
- Portable project export/import.
- Planner as Stage Frames.
- Tasks as the main work unit.
- Task statuses, checklists, and notes.
- Today as Resume-first screen.
- Semi-automatic Resume Brief.
- Optional Focus Mode with no-limit and timebox modes.
- Compact Work Review after Focus Mode or manual work entry.
- Capture Inbox with basic types.
- Work Log as a stream of work facts.
- Git read-only: branch, commits, timestamps, changed files.
- Auto-link commits by Focus interval first, active task fallback.
- Manual correction for commit-task links.
- Day/week Timeline.
- Daily summary without AI.
- License / Entitlements Layer as an architectural boundary, if monetization is included early.

### Out Of Scope For MVP

- Team workspaces.
- Cloud sync.
- Account-dependent project storage.
- Roles and permissions.
- Git push, stage, commit, merge, rebase, conflict resolution.
- Full diff/code viewer.
- GitHub/GitLab PR integration.
- AI-generated Resume Brief.
- AI inbox triage.
- AI task decomposition inside the app.
- Advanced analytics.
- Subtasks as standalone entities.
- Plugin marketplace.
- Built-in code editor.

Out-of-scope items should not be blocked architecturally. The MVP should leave room for future AI features, Git actions, integrations, sync/backup, and richer planning.

## 10. Technical Component Boundaries

### Local Project Store

Stores local project data, including stages, tasks, checklist, notes, inbox, work log, Resume Brief, and settings.

It must support portable export/import.

### Markdown Import / Export

Parses plans through Template + Preview and exports readable Markdown plans/summaries.

### Planner Engine

Manages Stage Frames, active stage, completed stages, future stages, task progress, and stage progress.

### Resume Engine

Builds Resume Brief from task context, notes, work entries, inbox, Git metadata, and next step.

### Git Adapter

Read-only adapter for local Git metadata and commit linking.

### Focus Mode / Work Log

Handles optional time-aware work mode and stores work entries independently from the timer.

### License Layer

Handles trial, Founder License, and future subscription entitlements without owning project data.

## 11. Quality Criteria

The MVP should be considered coherent only if:

- a user can create a project and import a Markdown plan;
- the imported plan becomes useful Stage Frames, not just displayed Markdown;
- Today clearly answers "where did I stop and what do I do next?";
- the app remains useful without Git;
- the app remains useful without Focus Mode;
- Git errors do not break project planning;
- commit auto-linking can be corrected;
- portable export/import works for a project transfer scenario;
- Work Review stays compact and does not block the user;
- Resume Brief is not empty when the project has an active task, notes, Git activity, or next-step data.

## 12. Open Design Areas

These areas need deeper design before implementation:

- exact Work Review UX;
- exact Resume Brief layout and copy;
- exact Markdown import preview interactions;
- exact portable export format;
- licensing provider and offline grace rules;
- future AI import and AI brief behavior;
- future Git actions and IDE integration.
