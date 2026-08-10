/**
 * Tiny shared date helpers. `dayKey` renders a local calendar date as a
 * sortable string ("2026-08-10") used by modules that roll data up per day
 * (screen time, focus allow-today). Kept local-timezone-accurate: it uses
 * the machine's own calendar, never UTC.
 */

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
