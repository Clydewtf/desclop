# Desclop

Desclop is a desktop-only, local-first workspace for developers who want to resume coding without losing context.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run test -- --run
cd apps/desktop/src-tauri && cargo test
npm run test:e2e
```

## MVP Boundaries

- Project workflow data stays local.
- Git integration is read-only.
- Focus Mode is optional.
- Markdown export is readable, not a full-fidelity backup.
- Portable bundles transfer workflow data and do not copy source code.
- License state is isolated from project data.
