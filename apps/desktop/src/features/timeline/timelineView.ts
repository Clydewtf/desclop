export interface TimelineView {
  facts: string[];
}

export function buildTimelineView(facts: string[]): TimelineView {
  return {
    facts: Array.from(
      new Set(
        facts
          .map((fact) => fact.trim())
          .filter((fact) => fact.length > 0)
      )
    )
  };
}
