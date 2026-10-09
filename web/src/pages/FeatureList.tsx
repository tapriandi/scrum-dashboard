import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useRefresh } from '../hooks';
import { barsFor, devEndDate, earliestRelease, warningsFor } from '../schedule';
import { fmtDate } from '../weeks';
import { ChangeTable } from '../components/ChangeTable';
import { EstimateForm } from '../components/EstimateForm';
import { JiraPanel } from '../components/JiraPanel';
import { ResourceGrid } from '../components/ResourceGrid';
import { SettingsBar } from '../components/SettingsBar';
import type { AppState, Feature } from '../types';

function Detail({ feature, state }: { feature: Feature; state: AppState }) {
  const refresh = useRefresh();
  const { data: log } = useQuery({
    queryKey: ['changelog', feature.id],
    queryFn: () => api.changelog(feature.id, 50),
  });
  const [deps, setDeps] = useState(feature.dependencies ?? '');
  const [notes, setNotes] = useState(feature.notes ?? '');
  const [release, setRelease] = useState(feature.release ?? '');
  const [priority, setPriority] = useState(feature.priority ?? '');
  const [reason, setReason] = useState('');
  const patch = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.patchFeature(feature.id, { ...p, reason: reason || undefined }),
    onSuccess: refresh,
  });
  const warnings = warningsFor(feature, state.weeks);

  return (
    <div className="mt-4 space-y-4">
      {warnings.map((w) => (
        <p key={w} className="rounded bg-amber-100 px-3 py-1 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          {w}
        </p>
      ))}
      <div className="card grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={feature.confirmed} onChange={(x) => patch.mutate({ confirmed: x.target.checked })} />
          Confirmed
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={feature.parallel} onChange={(x) => patch.mutate({ parallel: x.target.checked })} />
          Dev parallel to Product
        </label>
        <label className="flex flex-col gap-1">
          Release
          <select
            className="input"
            value={release}
            onChange={(x) => {
              setRelease(x.target.value);
              patch.mutate({ release: x.target.value || null });
            }}
          >
            <option value="" />
            {state.releases.map((r) => (
              <option key={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Priority
          <input
            className="input"
            value={priority}
            onChange={(x) => setPriority(x.target.value)}
            onBlur={() => priority !== (feature.priority ?? '') && patch.mutate({ priority: priority || null })}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          Dependencies
          <input
            className="input"
            value={deps}
            onChange={(x) => setDeps(x.target.value)}
            onBlur={() => deps !== (feature.dependencies ?? '') && patch.mutate({ dependencies: deps || null })}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          Notes
          <input
            className="input"
            value={notes}
            onChange={(x) => setNotes(x.target.value)}
            onBlur={() => notes !== (feature.notes ?? '') && patch.mutate({ notes: notes || null })}
          />
        </label>
        <label className="flex flex-col gap-1">
          BE people needed (during Dev)
          <input
            key={`be-${feature.beNeed}`}
            className="input"
            type="number"
            min="0"
            step="0.5"
            defaultValue={feature.beNeed || ''}
            onBlur={(x) => Number(x.target.value || 0) !== feature.beNeed && patch.mutate({ be_need: Number(x.target.value || 0) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          FE people needed (during Dev)
          <input
            key={`fe-${feature.feNeed}`}
            className="input"
            type="number"
            min="0"
            step="0.5"
            defaultValue={feature.feNeed || ''}
            onBlur={(x) => Number(x.target.value || 0) !== feature.feNeed && patch.mutate({ fe_need: Number(x.target.value || 0) })}
          />
        </label>
        <p className="col-span-2 self-end text-xs text-slate-500">
          Applied to every Dev week. Per-week rows below override it.
        </p>
        <label className="col-span-4 flex flex-col gap-1">
          Reason for the next scope/priority/flag change (optional)
          <input className="input" value={reason} onChange={(x) => setReason(x.target.value)} />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <EstimateForm key={`p-${feature.id}-${feature.estimates.product?.lastChangedAt}`} feature={feature} kind="product" weeks={state.weeks} />
        <EstimateForm key={`d-${feature.id}-${feature.estimates.dev?.lastChangedAt}`} feature={feature} kind="dev" weeks={state.weeks} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ResourceGrid key={`r-${feature.id}-${JSON.stringify(feature.resources)}`} feature={feature} weeks={state.weeks} settings={state.settings} />
        <JiraPanel key={`j-${feature.id}`} feature={feature} jiraConfigured={state.jiraConfigured} />
      </div>
      <div className="card">
        <h3 className="mb-2 font-semibold">Change history</h3>
        <ChangeTable rows={log ?? []} />
      </div>
    </div>
  );
}

export default function FeatureList({ state, onChanged }: { state: AppState; onChanged: () => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const refresh = useRefresh();
  const create = useMutation({
    mutationFn: () => api.createFeature(name.trim()),
    onSuccess: ({ id }) => {
      setName('');
      setOpenId(id);
      refresh();
      onChanged();
    },
  });
  const { weeks, settings } = state;

  return (
    <div>
      <SettingsBar settings={settings} />
      <div className="card">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Feature</th>
              <th>Product</th>
              <th>Dev</th>
              <th>Dev ends</th>
              <th>Earliest release</th>
              <th>Release</th>
            </tr>
          </thead>
          <tbody>
            {state.features.map((f) => {
              const p = f.estimates.product;
              const d = f.estimates.dev;
              const rel = earliestRelease(f, weeks, settings.qaWeeks);
              const bars = barsFor(f, weeks, 0);
              const devBar = bars.find((b) => b.kind === 'dev');
              return (
                <tr
                  key={f.id}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    openId === f.id ? 'bg-slate-50 dark:bg-slate-800/50' : ''
                  }`}
                  onClick={() => setOpenId(openId === f.id ? null : f.id)}
                >
                  <td className="py-2 font-medium">
                    {f.name}
                    {!f.confirmed && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">not confirmed</span>}
                    {f.isFiller && <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs dark:bg-slate-700">filler</span>}
                  </td>
                  <td>{p ? `${p.status ?? '-'}${p.startWeek ? ` · ${p.startWeek}` : ''}` : '-'}</td>
                  <td>
                    {d
                      ? `${d.startWeek ?? '?'} · ${d.durationWeeks ?? '?'}w${devBar ? '' : ''}`
                      : '-'}
                  </td>
                  <td>{fmtDate(devEndDate(f, weeks))}</td>
                  <td>{fmtDate(rel)}</td>
                  <td>{f.release ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="New feature name"
            value={name}
            onChange={(x) => setName(x.target.value)}
            onKeyDown={(x) => x.key === 'Enter' && name.trim() && create.mutate()}
          />
          <button className="btn-primary" disabled={!name.trim()} onClick={() => create.mutate()}>
            Add feature
          </button>
        </div>
      </div>
      {openId && state.features.find((f) => f.id === openId) && (
        <Detail key={openId} feature={state.features.find((f) => f.id === openId)!} state={state} />
      )}
    </div>
  );
}
