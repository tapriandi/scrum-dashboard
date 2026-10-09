import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { useRefresh } from '../hooks';
import { barsFor, type Bar, type BarKind } from '../schedule';
import { addDays, fmtDate, lastWorkday } from '../weeks';
import type { AppState, Feature } from '../types';

const COL = 84;
const LEFT = 300;
const ROW = 44;

const COLORS: Record<BarKind, string> = {
  product: 'bg-sky-500 border-sky-700',
  dev: 'bg-emerald-500 border-emerald-700',
  qa: 'bg-violet-500 border-violet-700',
};

function tooltip(f: Feature, b: Bar, state: AppState): string {
  if (b.kind === 'qa') return `${f.name}\nQA regression, ${state.settings.qaWeeks} weeks (setting)`;
  const e = b.estimate!;
  return [
    `${f.name} · ${b.kind === 'product' ? 'Product' : 'Dev'} estimate`,
    `Source: ${e.source}${e.owner ? ` (owner ${e.owner})` : ''}`,
    `Status: ${e.status ?? '-'}${b.dashed ? ' · not confirmed' : ''}`,
    `Start ${e.startWeek}, ${e.durationWeeks} weeks, ends ${fmtDate(lastWorkday(state.weeks, e.startWeek, e.durationWeeks))}`,
    `Last changed ${new Date(e.lastChangedAt).toLocaleDateString('en-GB')} by ${e.lastChangedBy}`,
    e.reason ? `Why: ${e.reason}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function QuickEdit({ f, state }: { f: Feature; state: AppState }) {
  const refresh = useRefresh();
  const dev = f.estimates.dev;
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.putEstimate(f.id, 'dev', body),
    onSuccess: refresh,
  });
  return (
    <div className="flex items-center gap-1 text-xs">
      <select
        className="input w-20 px-1 py-0.5"
        value={dev?.startWeek ?? ''}
        onChange={(x) => save.mutate({ start_week: x.target.value || null, reason: 'Edited on timeline' })}
      >
        <option value="" />
        {state.weeks.map((w) => (
          <option key={w.code}>{w.code}</option>
        ))}
      </select>
      <input
        key={`${f.id}-${dev?.durationWeeks}`}
        className="input w-14 px-1 py-0.5"
        type="number"
        min="0.5"
        step="0.5"
        defaultValue={dev?.durationWeeks ?? ''}
        onBlur={(x) =>
          x.target.value &&
          Number(x.target.value) !== dev?.durationWeeks &&
          save.mutate({ duration_weeks: Number(x.target.value), reason: 'Edited on timeline' })
        }
      />
      <span className="text-slate-500">w</span>
    </div>
  );
}

export default function Timeline({ state }: { state: AppState }) {
  const { weeks, settings, features } = state;
  const width = LEFT + weeks.length * COL;
  const todayIso = new Date().toISOString().slice(0, 10);
  const dayOffset = (new Date(todayIso).getTime() - new Date(weeks[0].startDate).getTime()) / 86400000;
  const todayX = LEFT + (dayOffset / 7) * COL;
  const showToday = dayOffset >= 0 && dayOffset < weeks.length * 7;
  const rel = state.releases.find((r) => r.fixedDate);
  const relOffset = rel?.fixedDate
    ? (new Date(rel.fixedDate).getTime() - new Date(weeks[0].startDate).getTime()) / 86400000
    : -1;

  return (
    <div className="card overflow-auto">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-5 rounded border bg-sky-500" /> Product</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-5 rounded border bg-emerald-500" /> Dev</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-5 rounded border bg-violet-500" /> QA regression ({settings.qaWeeks}w)</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-5 rounded border border-dashed border-slate-500" /> Not confirmed</span>
        <span className="text-slate-500">Hover a bar for source, owner and last change. Left inputs edit Dev start and duration.</span>
      </div>
      <div className="relative" style={{ width }}>
        <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" style={{ height: 44 }}>
          <div style={{ width: LEFT }} className="px-2 py-2 text-xs font-medium uppercase text-slate-500">
            Feature / Dev start, duration
          </div>
          {weeks.map((w) => (
            <div key={w.code} style={{ width: COL }} className="border-l border-slate-200 px-1 py-1 text-center text-xs dark:border-slate-800">
              <div className="font-medium">{w.code}</div>
              <div className="text-slate-500">{fmtDate(w.startDate)}</div>
            </div>
          ))}
        </div>

        {features
          .filter((f) => !f.isFiller)
          .map((f) => {
            const bars = barsFor(f, weeks, settings.qaWeeks);
            return (
              <div key={f.id} className="relative flex border-b border-slate-100 dark:border-slate-800" style={{ height: ROW }}>
                <div style={{ width: LEFT }} className="flex flex-col justify-center gap-0.5 px-2">
                  <span className="truncate text-sm font-medium">
                    {f.name}
                    {!f.confirmed && <span className="ml-1 text-xs text-amber-600">(not confirmed)</span>}
                  </span>
                  <QuickEdit f={f} state={state} />
                </div>
                {weeks.map((w) => (
                  <div key={w.code} style={{ width: COL }} className="border-l border-slate-100 dark:border-slate-800" />
                ))}
                {bars.map((b) => {
                  const visibleSpan = Math.min(b.span, weeks.length - b.startIdx);
                  if (visibleSpan <= 0) return null;
                  return (
                    <div
                      key={b.kind}
                      title={tooltip(f, b, state)}
                      className={`absolute flex items-center overflow-hidden rounded border px-1 text-[10px] leading-3 text-white ${COLORS[b.kind]} ${
                        b.dashed ? 'border-dashed opacity-60' : ''
                      }`}
                      style={{
                        left: LEFT + b.startIdx * COL + 2,
                        width: visibleSpan * COL - 4,
                        top: b.kind === 'product' ? 2 : b.kind === 'dev' ? 16 : 30,
                        height: 13,
                      }}
                    >
                      {b.kind === 'qa' ? 'QA' : b.kind === 'product' ? 'Product' : 'Dev'}
                      {b.estimate && ` · ${b.estimate.source}`}
                    </div>
                  );
                })}
              </div>
            );
          })}

        {showToday && (
          <div className="pointer-events-none absolute z-20 w-px bg-red-500" style={{ left: todayX, top: 44, bottom: 0 }} title={`Today ${fmtDate(todayIso)}`}>
            <span className="absolute -top-4 -translate-x-1/2 rounded bg-red-500 px-1 text-[10px] text-white">Today</span>
          </div>
        )}
        {rel?.fixedDate && relOffset >= 0 && relOffset < weeks.length * 7 && (
          <div
            className="pointer-events-none absolute z-10 w-px border-l border-dashed border-amber-600"
            style={{ left: LEFT + (relOffset / 7) * COL, top: 44, bottom: 0 }}
            title={`${rel.name}: ${fmtDate(rel.fixedDate)}`}
          >
            <span className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap rounded bg-amber-600 px-1 text-[10px] text-white">
              {rel.name}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">Weeks start on Monday. First column {fmtDate(weeks[0].startDate)}, last week ends {fmtDate(addDays(weeks[weeks.length - 1].startDate, 6))}.</p>
    </div>
  );
}
