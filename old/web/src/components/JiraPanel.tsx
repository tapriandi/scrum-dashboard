import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useRefresh } from '../hooks';
import type { Feature } from '../types';

export function JiraPanel({ feature, jiraConfigured }: { feature: Feature; jiraConfigured: boolean }) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  const key = ['jira', feature.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.getJiraForFeature(feature.id), refetchInterval: 60_000 });
  const [epics, setEpics] = useState(feature.jira.map((l) => l.epicKey).filter(Boolean).join(', '));
  const [err, setErr] = useState<string | null>(null);

  const saveLinks = useMutation({
    mutationFn: () =>
      api.putJiraLinks(
        feature.id,
        epics
          .split(/[,\s]+/)
          .filter(Boolean)
          .map((k) => ({ epicKey: k.toUpperCase(), label: null, jql: null })),
      ),
    onSuccess: () => {
      setErr(null);
      refresh();
      setTimeout(() => void qc.invalidateQueries({ queryKey: key }), 2500);
    },
    onError: (x) => setErr((x as Error).message),
  });

  const sync = useMutation({
    mutationFn: () => api.syncJira(),
    onSuccess: () => {
      setErr(null);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (x) => setErr((x as Error).message),
  });

  const results = data ?? [];
  const total = results.reduce((n, r) => n + (r.summary?.total ?? 0), 0);
  const done = results.reduce((n, r) => n + (r.summary?.done ?? 0), 0);
  const blockers = results.flatMap((r) => r.summary?.blockers ?? []);
  const lastSynced = results.map((r) => r.syncedAt).filter(Boolean).sort().at(-1);
  const errors = results.map((r) => r.error).filter(Boolean);
  const assignees: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.summary?.openByAssignee ?? {})) assignees[k] = (assignees[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.summary?.byStatus ?? {})) statuses[k] = (statuses[k] ?? 0) + v;
  }
  const pct = total ? Math.round((done / total) * 100) : 0;
  const issues = results.flatMap((r) => r.summary?.issues ?? []);

  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Jira</h3>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {lastSynced ? `Last synced ${new Date(lastSynced).toLocaleTimeString('en-GB')}` : 'Never synced'}
          <button className="btn" disabled={!jiraConfigured || sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-end gap-2 text-sm">
        <label className="flex flex-1 flex-col gap-1">
          Epic keys (comma separated)
          <input className="input" placeholder="GF-4446, GF-4445" value={epics} onChange={(x) => setEpics(x.target.value)} />
        </label>
        <button className="btn" onClick={() => saveLinks.mutate()}>
          Save links
        </button>
      </div>

      {!jiraConfigured && <p className="mb-2 text-sm text-amber-600">Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in server/.env.</p>}
      {errors.length > 0 && (
        <p className="mb-2 text-sm text-amber-600">Last sync failed, showing cached data: {errors[0]}</p>
      )}
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

      {total > 0 ? (
        <>
          <div className="mb-1 flex justify-between text-sm">
            <span>
              {done} / {total} done
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mb-3 flex flex-wrap gap-1 text-xs">
            {Object.entries(statuses).map(([s, n]) => (
              <span key={s} className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                {s}: {n}
              </span>
            ))}
          </div>
          <div className="mb-3 text-sm">
            <span className="text-slate-500">Open by assignee: </span>
            {Object.entries(assignees)
              .map(([k, v]) => `${k} (${v})`)
              .join(', ') || '-'}
          </div>
          <div className="mb-3 text-sm">
            <span className="font-medium">Blockers ({blockers.length})</span>
            {blockers.length === 0 ? (
              <span className="text-slate-500"> none via "is blocked by" link or blocker label</span>
            ) : (
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b.key}>
                    <a className="text-emerald-600 underline" href={issues.find((i) => i.key === b.key)?.url} target="_blank" rel="noreferrer">
                      {b.key}
                    </a>{' '}
                    {b.summary} <span className="text-slate-500">({b.reason})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-slate-500">Issues ({issues.length})</summary>
            <ul className="mt-2 max-h-60 space-y-1 overflow-auto text-sm">
              {issues.map((i) => (
                <li key={i.key}>
                  <a className="text-emerald-600 underline" href={i.url} target="_blank" rel="noreferrer">
                    {i.key}
                  </a>{' '}
                  {i.summary} <span className="text-slate-500">· {i.status} · {i.assignee ?? 'Unassigned'}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          {feature.jira.length ? 'No child issues cached yet. Click Refresh.' : 'No Jira epic linked.'}
        </p>
      )}
    </div>
  );
}
