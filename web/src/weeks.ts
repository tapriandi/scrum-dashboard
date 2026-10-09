import type { WeekInfo } from './types';

export function weekIndex(weeks: WeekInfo[], code: string | null | undefined): number {
  if (!code) return -1;
  return weeks.findIndex((w) => w.code === code);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of week index i, works past the visible range too. */
export function mondayOfIndex(weeks: WeekInfo[], i: number): string {
  return addDays(weeks[0].startDate, i * 7);
}

/** Friday of the last week occupied by a bar. Fractional durations round up to whole weeks. */
export function lastWorkday(weeks: WeekInfo[], startWeek: string | null, durationWeeks: number | null): string | null {
  const idx = weekIndex(weeks, startWeek);
  if (idx < 0 || !durationWeeks || durationWeeks <= 0) return null;
  return addDays(mondayOfIndex(weeks, idx + Math.ceil(durationWeeks) - 1), 4);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
