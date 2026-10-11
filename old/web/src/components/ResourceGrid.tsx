import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { useRefresh } from '../hooks';
import { barsFor } from '../schedule';
import type { Feature, Settings, WeekInfo } from '../types';

export function ResourceGrid({ feature, weeks, settings }: { feature: Feature; weeks: WeekInfo[]; settings: Settings }) {
  const refresh = useRefresh();
  const init: Record<string, { be: string; fe: string }> = {};
  for (const w of weeks) {
    const r = feature.resources.find((x) => x.week === w.code);
    init[w.code] = { be: r?.be ? String(r.be) : '', fe: r?.fe ? String(r.fe) : '' };
  }
  const [vals, setVals] = useState(init);
  const dev = barsFor(feature, weeks, 0).find((b) => b.kind === 'dev');
  const [from, setFrom] = useState(dev ? weeks[dev.startIdx].code : weeks[0].code);
  const [to, setTo] = useState(dev ? weeks[Math.min(dev.startIdx + dev.span - 1, weeks.length - 1)].code : weeks[0].code);
  const [fillBe, setFillBe] = useState('');
  const [fillFe, setFillFe] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.putResources(
        feature.id,
        weeks.map((w) => ({ week: w.code, be: Number(vals[w.code].be || 0), fe: Number(vals[w.code].fe || 0) })),
        reason || undefined,
      ),
    onSuccess: () => {
      setReason('');
      setErr(null);
      refresh();
    },
    onError: (x) => setErr((x as Error).message),
  });

  function applyFill() {
    const a = weeks.findIndex((w) => w.code === from);
    const b = weeks.findIndex((w) => w.code === to);
    const next = { ...vals };
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
      next[weeks[i].code] = { be: fillBe, fe: fillFe };
    }
    setVals(next);
  }

  return (
    <div className="card">
      <h3 className="mb-2 font-semibold">Resources needed per week</h3>
      <div className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          From
          <select className="input" value={from} onChange={(x) => setFrom(x.target.value)}>
            {weeks.map((w) => (
              <option key={w.code}>{w.code}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          To
          <select className="input" value={to} onChange={(x) => setTo(x.target.value)}>
            {weeks.map((w) => (
              <option key={w.code}>{w.code}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          BE
          <input className="input w-16" type="number" min="0" step="0.5" value={fillBe} onChange={(x) => setFillBe(x.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          FE
          <input className="input w-16" type="number" min="0" step="0.5" value={fillFe} onChange={(x) => setFillFe(x.target.value)} />
        </label>
        <button className="btn" onClick={applyFill}>
          Fill range
        </button>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Week</th>
              <th>BE (of {settings.beTotal})</th>
              <th>FE (of {settings.feTotal})</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.code} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1">
                  {w.code} <span className="text-xs text-slate-500">{w.startDate.slice(5)}</span>
                </td>
                {(['be', 'fe'] as const).map((k) => (
                  <td key={k}>
                    <input
                      className="input w-20"
                      type="number"
                      min="0"
                      step="0.5"
                      value={vals[w.code][k]}
                      onChange={(x) => setVals({ ...vals, [w.code]: { ...vals[w.code], [k]: x.target.value } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          className="input flex-1"
          placeholder="Reason for change"
          value={reason}
          onChange={(x) => setReason(x.target.value)}
        />
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save resources
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
