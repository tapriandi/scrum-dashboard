import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { useRefresh } from '../hooks';
import type { Feature, WeekInfo } from '../types';
import { fmtDate, lastWorkday } from '../weeks';

const STATUSES = ['pending', 'planned', 'in_progress', 'to_confirm', 'confirmed', 'final', 'done'];

export function EstimateForm({
  feature,
  kind,
  weeks,
}: {
  feature: Feature;
  kind: 'product' | 'design' | 'dev' | 'qa_test';
  weeks: WeekInfo[];
}) {
  const e = feature.estimates[kind];
  const refresh = useRefresh();
  const [owner, setOwner] = useState(e?.owner ?? '');
  const [startWeek, setStartWeek] = useState(e?.startWeek ?? '');
  const [duration, setDuration] = useState(e?.durationWeeks?.toString() ?? '');
  const [targetDate, setTargetDate] = useState(e?.targetDate ?? '');
  const [status, setStatus] = useState(e?.status ?? '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.putEstimate(feature.id, kind, {
        owner: owner || null,
        start_week: startWeek || null,
        duration_weeks: duration ? Number(duration) : null,
        target_date: targetDate || null,
        status: status || null,
        reason: reason || null,
      }),
    onSuccess: () => {
      setReason('');
      setErr(null);
      refresh();
    },
    onError: (x) => setErr((x as Error).message),
  });

  const end = lastWorkday(weeks, startWeek || null, duration ? Number(duration) : null);
  const label = { product: 'Product estimate', design: 'Design estimate', dev: 'Dev estimate', qa_test: 'QA test estimate' }[kind];

  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-semibold">{label}</h3>
        {e && (
          <span className="text-xs text-slate-500">
            by {e.source} · changed {new Date(e.lastChangedAt).toLocaleDateString('en-GB')} by {e.lastChangedBy}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          Owner
          <input className="input" value={owner} onChange={(x) => setOwner(x.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Status
          <select className="input" value={status} onChange={(x) => setStatus(x.target.value)}>
            <option value="" />
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Start week
          <select className="input" value={startWeek} onChange={(x) => setStartWeek(x.target.value)}>
            <option value="" />
            {weeks.map((w) => (
              <option key={w.code} value={w.code}>
                {w.code} ({fmtDate(w.startDate)})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Duration (weeks)
          <input
            className="input"
            type="number"
            min="0.5"
            step="0.5"
            value={duration}
            onChange={(x) => setDuration(x.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Target date
          <input className="input" type="date" value={targetDate} onChange={(x) => setTargetDate(x.target.value)} />
        </label>
        <div className="flex flex-col gap-1">
          Ends
          <span className="py-1">{end ? fmtDate(end) : '-'}</span>
        </div>
        <label className="col-span-2 flex flex-col gap-1">
          Reason for change
          <input
            className="input"
            placeholder="Why is this changing?"
            value={reason}
            onChange={(x) => setReason(x.target.value)}
          />
        </label>
      </div>
      {e?.reason && <p className="mt-2 text-xs text-slate-500">Last reason: {e.reason}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3">
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save {kind}
        </button>
      </div>
    </div>
  );
}
