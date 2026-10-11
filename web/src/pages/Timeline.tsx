import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { useRefresh } from '../hooks';
import { barsFor, regressionSpans, type Bar, type BarKind } from '../schedule';
import { fmtDate, lastWorkday } from '../weeks';
import type { AppState, Feature } from '../types';

const COL = 84;
const LEFT = 300;
const ROW = 56;

const COLORS: Record<BarKind, string> = {
  product: 'bg-sky-500 border-sky-700',
  design: 'bg-pink-500 border-pink-700',
  dev: 'bg-emerald-500 border-emerald-700',
  qa_test: 'bg-violet-500 border-violet-700',
};

const KIND_LABEL: Record<BarKind, string> = {
  product: 'Product',
  design: 'Design',
  dev: 'Dev',
  qa_test: 'QA test',
};

function tooltip(f: Feature, b: Bar, state: AppState): string {
  const e = b.estimate!;
  return [
    `${f.name} · ${KIND_LABEL[b.kind]} estimate`,
    `Source: ${e.source}${e.owner ? ` (owner ${e.owner})` : ''}`,
    `Status: ${e.status ?? '-'}${b.dashed ? ' · not confirmed' : ''}`,
    `Start ${e.startWeek}, ${e.durationWeeks} weeks, ends ${fmtDate(lastWorkday(state.weeks, e.startWeek, e.durationWeeks))}`,
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

function RegressionManager({ state }: { state: AppState }) {
  const refresh = useRefresh();
  const [name, setName] = useState('');
  const [startWeek, setStartWeek] = useState('');
  const [weeks, setWeeks] = useState('2');
  const [err, setErr] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createRegressionBlock({ name, startWeek, weeks: Number(weeks) }),
    onSuccess: () => {
      setName('');
      setErr(null);
      refresh();
    },
    onError: (x) => setErr((x as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteRegressionBlock(id),
    onSuccess: refresh,
  });
  return (
    <div className="card mb-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          Regression block name
          <input className="input w-44" placeholder="e.g. Release 1.4" value={name} onChange={(x) => setName(x.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Start week
          <select className="input w-28" value={startWeek} onChange={(x) => setStartWeek(x.target.value)}>
            <option value="" />
            {state.weeks.map((w) => (
              <option key={w.code}>{w.code}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Weeks
          <input className="input w-16" type="number" min="1" max="8" value={weeks} onChange={(x) => setWeeks(x.target.value)} />
        </label>
        <button className="btn-primary" disabled={!name || !startWeek || create.isPending} onClick={() => create.mutate()}>
          Add block
        </button>
        {state.regressionBlocks.map((b) => (
          <span key={b.id} className="flex items-center gap-1 rounded border border-amber-600 bg-amber-300/60 px-2 py-1 text-xs text-amber-900">
            {b.name} · {b.startWeek} · {b.weeks}w
            <button className="text-amber-900 underline" onClick={() => remove.mutate(b.id)}>
              x
            </button>
          </span>
        ))}
      </div>
      {err && <p className="mt-2 text-red-600">{err}</p>}
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
  const regSpans = regressionSpans(state.regressionBlocks, weeks);

  return (
    <>
      <RegressionManager state={state} />
      <div className="card overflow-auto">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        {(Object.keys(COLORS) as BarKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <i className={`inline-block h-3 w-5 rounded border ${COLORS[k]}`} /> {KIND_LABEL[k]}
          </span>
        ))}
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-6 rounded border bg-amber-300/60 border-amber-600" /> Regression block</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-5 rounded border border-dashed border-slate-500" /> Not confirmed</span>
        <span className="text-slate-500">Hover a bar for details. Left inputs edit Dev start and duration.</span>
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

        <div className="relative" style={{ height: regSpans.length ? 18 : 0 }}>
          {regSpans.map((r) => (
            <div
              key={r.block.id}
              className="absolute flex items-center justify-center overflow-hidden rounded border border-amber-600 bg-amber-300/60 text-[10px] text-amber-900"
              style={{ left: LEFT + r.startIdx * COL + 2, width: r.span * COL - 4, top: 1, height: 15 }}
              title={`${r.block.name}: regression testing ${r.block.weeks} weeks from ${r.block.startWeek}`}
            >
              {r.block.name} · regression {r.block.weeks}w
            </div>
          ))}
        </div>

        {features
          .filter((f) => !f.isFiller)
          .map((f) => {
            const bars = barsFor(f, weeks, settings.qaWeeks);
            const hasAny = bars.length > 0;
            return (
              <div key={f.id} className="relative flex border-b border-slate-100 dark:border-slate-800" style={{ height: ROW }}>
                <div style={{ width: LEFT }} className="flex flex-col justify-center gap-0.5 px-2">
                  <span className="truncate text-sm font-medium">
                    {f.name}
                    {!f.confirmed && <span className="ml-1 text-xs text-amber-600">(not confirmed)</span>}
                  </span>
                  {!hasAny && <span className="text-xs text-slate-400">No dates yet</span>}
                  <QuickEdit f={f} state={state} />
                </div>
                {weeks.map((w) => {
                  const inReg = regSpans.some((r) => {
                    const wi = weeks.indexOf(w);
                    return wi >= r.startIdx && wi < r.startIdx + r.span;
                  });
                  return (
                    <div
                      key={w.code}
                      style={{ width: COL }}
                      className={`border-l border-slate-100 dark:border-slate-800 ${inReg ? 'bg-amber-100/50 dark:bg-amber-900/20' : ''}`}
                    />
                  );
                })}
                {bars.map((b) => {
                  const visibleSpan = Math.min(b.span, weeks.length - b.startIdx);
                  if (visibleSpan <= 0) return null;
                  const rowTop = b.kind === 'product' ? 3 : b.kind === 'design' ? 17 : b.kind === 'dev' ? 31 : 42;
                  return (
                    <div
                      key={b.kind}
                      title={tooltip(f, b, state)}
                      className={`absolute flex items-center gap-1 overflow-hidden rounded border px-1 text-[10px] leading-3 text-white ${COLORS[b.kind]} ${
                        b.dashed ? 'border-dashed opacity-60' : ''
                      }`}
                      style={{ left: LEFT + b.startIdx * COL + 2, width: visibleSpan * COL - 4, top: rowTop, height: 13 }}
                    >
                      <span>{KIND_LABEL[b.kind]}</span>
                    </div>
                  );
                })}
                {f.note && (
                  <div
                    className="absolute truncate rounded border border-slate-300 bg-slate-100 px-1 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    style={{ left: LEFT + weeks.length * COL + 8, top: 20, maxWidth: 260 }}
                    title={f.note}
                  >
                    {f.note}
                  </div>
                )}
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
      <p className="mt-2 text-xs text-slate-500">Weeks start on Monday. First column {fmtDate(weeks[0].startDate)}, last week starts {fmtDate(weeks[weeks.length - 1].startDate)}.</p>
      </div>
    </>
  );
}
