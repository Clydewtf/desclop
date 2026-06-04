import { type ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <aside className="app-sidebar" aria-label="Application">
        <strong>Desclop</strong>
      </aside>
      <section className="app-content">{children}</section>
    </main>
  );
}
