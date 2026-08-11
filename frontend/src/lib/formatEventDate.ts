// "Today" / "Tomorrow" / "This {Weekday}" close in, exact date further out —
// so an event card reads at a glance without making customers do date math,
// while it still shows correctly once an event is more than a week away.
// Same calendar-day comparison approach as the admin's isToday check
// (components/admin/NotificationStack.tsx) — local time zone, date only.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatRelativeEventDate(iso: string): string {
  const eventDate = new Date(iso);
  const diffDays = Math.round(
    (startOfDay(eventDate).getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays >= 2 && diffDays <= 6) return `This ${WEEKDAYS[eventDate.getDay()]}`;
  return eventDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
