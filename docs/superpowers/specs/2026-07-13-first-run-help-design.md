# First-run help design

## Goal

Show a small welcome/help dialog the first time Desclop opens, explain the main navigation in a few lines, and remember when the user closes it so it does not return on later launches.

## Design

The React app renders a modal overlay after the initial loading state, including when the user still needs to create or choose a project. The dialog contains a short welcome message, brief descriptions of Today, Plan, Timeline, and Capture, and one dismiss action. It follows the existing dialog accessibility pattern and visual language.

The dismissed state is stored in browser `localStorage` under one app-owned key. No backend schema, Tauri command, or settings screen is added for this test version. If storage is unavailable, the dialog can still be closed for the current session.

## Success criteria

- A fresh app session shows the dialog once loading finishes.
- Closing the dialog removes it immediately and persists the dismissal.
- A later mount does not show it when the persisted value is present.
- Existing project setup and project screens remain usable underneath the overlay.
- Tests cover the component content and first-run persistence behavior.
