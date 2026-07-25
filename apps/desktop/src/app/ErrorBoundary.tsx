import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, InlineAlert, ScreenHeader } from "../shared/ui";
import {
  classifyError,
  createErrorReference,
  type SafeErrorCategory
} from "../shared/errors/safeError";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  category: SafeErrorCategory | null;
  reference: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { category: null, reference: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      category: classifyError(error),
      reference: createErrorReference("UI")
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const reference = this.state.reference ?? createErrorReference("UI");

    // Keep diagnostics useful without copying the original error, path, or stack
    // into a log that a tester may later share.
    console.error("Desclop UI error", {
      category: classifyError(error),
      componentStackCaptured: Boolean(info.componentStack),
      reference
    });
  }

  render() {
    if (!this.state.reference) {
      return this.props.children;
    }

    const recoveryMessage =
      this.state.category === "database"
        ? "Desclop could not display local data. Restart the app and follow the database recovery instructions if this repeats."
        : this.state.category === "filesystem"
          ? "Desclop could not access a local file. Check the project folder or backup and restart the app."
          : "Desclop could not display this screen. Your local data was not changed.";

    return (
      <main className="app-error-boundary">
        <section className="ui-surface app-error-boundary__card" aria-label="Desclop needs attention">
          <ScreenHeader
            eyebrow="Local recovery"
            title="Desclop needs attention"
            description="The app stopped rendering this screen, but it did not replace your local data."
            descriptionKind="status"
          />
          <InlineAlert tone="error">{recoveryMessage}</InlineAlert>
          <p className="ui-help-text">
            If this repeats, open Project health after restarting and include only the support report in your feedback.
          </p>
          <p className="ui-help-text">
            Error reference: <code>{this.state.reference}</code>
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Restart Desclop
          </Button>
        </section>
      </main>
    );
  }
}
