import { db } from './db.js';
import { SPRINT_CALENDAR_START } from './weeks.js';

export interface Settings {
  beTotal: number;
  feTotal: number;
  qaWeeks: number;
  lowThreshold: number;
  calendarStart: string;
  weeksVisible: number;
}

export async function getSettings(): Promise<Settings> {
  const result = await db.execute('SELECT key, value FROM settings');
  const map = new Map(result.rows.map((r) => [String(r.key), String(r.value)]));
  const num = (k: string, d: number): number => {
    const v = Number(map.get(k));
    return Number.isFinite(v) ? v : d;
  };
  return {
    beTotal: num('be_total', 4),
    feTotal: num('fe_total', 4),
    qaWeeks: num('qa_weeks', 2),
    lowThreshold: num('low_threshold', 2),
    calendarStart: map.get('calendar_start') ?? SPRINT_CALENDAR_START,
    weeksVisible: num('weeks_visible', 12),
  };
}

export async function setSetting(key: string, value: string | number): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    args: [key, String(value)],
  });
}

export interface LogChangeArgs {
  entityType: string;
  entityId?: number;
  featureId?: number;
  field: string;
  from: unknown;
  to: unknown;
  by: string;
  reason?: string | null;
}

export async function logChange(a: LogChangeArgs): Promise<void> {
  await db.execute({
    sql: `INSERT INTO change_log (entity_type, entity_id, feature_id, field, from_value, to_value, changed_by, changed_at, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      a.entityType,
      a.entityId ?? null,
      a.featureId ?? null,
      a.field,
      a.from == null ? null : String(a.from),
      a.to == null ? null : String(a.to),
      a.by,
      new Date().toISOString(),
      a.reason ?? null,
    ],
  });
}
