import type { Estimate, Feature, Settings, WeekInfo } from './types';
import { addDays, lastWorkday, weekIndex } from './weeks';

export type BarKind = 'product' | 'dev' | 'qa';

export interface Bar {
  kind: BarKind;
  startIdx: number;
  span: number;
  dashed: boolean;
  estimate?: Estimate;
}

const UNSURE_STATUS = new Set(['pending', 'to_confirm']);

export function isDashed(f: Feature, e?: Estimate): boolean {
  return !f.confirmed || (e?.status ? UNSURE_STATUS.has(e.status) : false);
}

export function devEndDate(f: Feature, weeks: WeekInfo[]): string | null {
  const d = f.estimates.dev;
  return d ? lastWorkday(weeks, d.startWeek, d.durationWeeks) : null;
}

export function earliestRelease(f: Feature, weeks: WeekInfo[], qaWeeks: number): string | null {
  const end = devEndDate(f, weeks);
  return end ? addDays(end, qaWeeks * 7) : null;
}

export function barsFor(f: Feature, weeks: WeekInfo[], qaWeeks: number): Bar[] {
  const bars: Bar[] = [];
  for (const kind of ['product', 'dev'] as const) {
    const e = f.estimates[kind];
    const idx = weekIndex(weeks, e?.startWeek);
    if (e && idx >= 0 && e.durationWeeks && e.durationWeeks > 0) {
      bars.push({ kind, startIdx: idx, span: Math.ceil(e.durationWeeks), dashed: isDashed(f, e), estimate: e });
    }
  }
  const dev = bars.find((b) => b.kind === 'dev');
  if (dev && qaWeeks > 0) {
    bars.push({ kind: 'qa', startIdx: dev.startIdx + dev.span, span: qaWeeks, dashed: dev.dashed });
  }
  return bars;
}

export function warningsFor(f: Feature, weeks: WeekInfo[]): string[] {
  const out: string[] = [];
  const prod = f.estimates.product;
  const dev = f.estimates.dev;
  const pIdx = weekIndex(weeks, prod?.startWeek);
  const dIdx = weekIndex(weeks, dev?.startWeek);
  if (!f.parallel && prod?.durationWeeks && pIdx >= 0 && dIdx >= 0 && dIdx < pIdx + Math.ceil(prod.durationWeeks)) {
    out.push('Dev starts before Product ends (mark parallel if intended)');
  }
  if (dev?.startWeek && dIdx < 0) out.push(`Dev start week ${dev.startWeek} is outside the visible calendar`);
  return out;
}

export interface WeekLoad {
  week: WeekInfo;
  be: number;
  fe: number;
  freeBe: number;
  freeFe: number;
  /** Features whose dev bar covers this week but have no resource row for it. */
  missingInput: string[];
}

export function capacityByWeek(features: Feature[], weeks: WeekInfo[], s: Settings): WeekLoad[] {
  return weeks.map((week, i) => {
    let be = 0;
    let fe = 0;
    const missingInput: string[] = [];
    for (const f of features) {
      const r = f.resources.find((x) => x.week === week.code);
      const dev = barsFor(f, weeks, 0).find((b) => b.kind === 'dev');
      const inDev = dev && i >= dev.startIdx && i < dev.startIdx + dev.span;
      if (r) {
        be += r.be;
        fe += r.fe;
      } else if (inDev) {
        be += f.beNeed;
        fe += f.feNeed;
        if (f.beNeed === 0 && f.feNeed === 0) missingInput.push(f.name);
      }
    }
    return { week, be, fe, freeBe: s.beTotal - be, freeFe: s.feTotal - fe, missingInput };
  });
}

export type LoadLevel = 'over' | 'low' | 'ok';

export function levelOf(free: number, threshold: number): LoadLevel {
  if (free < 0) return 'over';
  if (free > threshold) return 'low';
  return 'ok';
}
