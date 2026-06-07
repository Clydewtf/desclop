import type { InboxKind } from "../../shared/domain/types";
import { QuickCapture } from "../../shared/ui";

interface InboxCaptureProps {
  onCapture: (input: { body: string; kind: InboxKind }) => void | Promise<void>;
}

export function InboxCapture({ onCapture }: InboxCaptureProps) {
  return <QuickCapture onCapture={onCapture} />;
}
