function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseDate(timestamp: string) {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTimelineDateLabel(timestamp: string, now = new Date()) {
  const date = parseDate(timestamp);
  if (!date) return "Undated";
  const dateDay = startOfLocalDay(date);
  const today = startOfLocalDay(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  if (dateDay === today) return `Today, ${monthDay}`;
  if (dateDay === yesterday) return `Yesterday, ${monthDay}`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatTimelineTime(timestamp: string) {
  const date = parseDate(timestamp);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
