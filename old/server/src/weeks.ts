// Sprint 55, Week 1 starts this Monday. Every sprint is 2 weeks, every week is 7 days.
export const SPRINT_CALENDAR_START = '2026-09-28';
export const FIRST_SPRINT_NUMBER = 55;

export interface WeekInfo {
  code: string; // e.g. "S55W1"
  sprintNumber: number;
  weekInSprint: 1 | 2;
  startDate: string; // ISO date, Monday
  endDate: string; // ISO date, Sunday
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekInfoAt(index: number, calendarStart = SPRINT_CALENDAR_START): WeekInfo {
  const sprintNumber = FIRST_SPRINT_NUMBER + Math.floor(index / 2);
  const weekInSprint = ((index % 2) + 1) as 1 | 2;
  const startDate = addDays(calendarStart, index * 7);
  const endDate = addDays(startDate, 6);
  return { code: `S${sprintNumber}W${weekInSprint}`, sprintNumber, weekInSprint, startDate, endDate };
}

export function weekRange(count: number, calendarStart = SPRINT_CALENDAR_START): WeekInfo[] {
  return Array.from({ length: count }, (_, i) => weekInfoAt(i, calendarStart));
}

export function weekIndexForCode(code: string, calendarStart = SPRINT_CALENDAR_START): number {
  const m = /^S(\d+)W([12])$/.exec(code);
  if (!m) throw new Error(`Invalid week code: ${code}`);
  const sprintNumber = Number(m[1]);
  const weekInSprint = Number(m[2]);
  return (sprintNumber - FIRST_SPRINT_NUMBER) * 2 + (weekInSprint - 1);
}

export function todayWeekCode(calendarStart = SPRINT_CALENDAR_START): string {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(calendarStart + 'T00:00:00Z');
  const now = new Date(today + 'T00:00:00Z');
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const index = Math.floor(diffDays / 7);
  return weekInfoAt(Math.max(index, 0), calendarStart).code;
}
