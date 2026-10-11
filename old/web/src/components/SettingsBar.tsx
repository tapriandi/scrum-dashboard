import { useState } from 'react';
import { api } from '../api';
import { useRefresh } from '../hooks';
import type { Settings } from '../types';

const FIELDS: { key: keyof Settings; label: string; step?: string }[] = [
  { key: 'beTotal', label: 'BE people' },
  { key: 'feTotal', label: 'FE people' },
  { key: 'qaWeeks', label: 'QA regression (weeks)' },
  { key: 'lowThreshold', label: 'Low workload if free >', step: '0.5' },
];

export function SettingsBar({ settings }: { settings: Settings }) {
  const refresh = useRefresh();
  const [err, setErr] = useState<string | null>(null);

  async function commit(key: keyof Settings, value: string) {
    if (value === '' || Number(value) === settings[key]) return;
    try {
      await api.putSettings({ [key]: Number(value) });
      setErr(null);
      refresh();
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div className="card mb-4 flex flex-wrap items-end gap-4 text-sm">
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          {f.label}
          <input
            key={`${f.key}-${settings[f.key]}`}
            className="input w-24"
            type="number"
            min="0"
            step={f.step ?? '1'}
            defaultValue={settings[f.key]}
            onBlur={(x) => void commit(f.key, x.target.value)}
          />
        </label>
      ))}
      {err && <span className="text-red-600">{err}</span>}
    </div>
  );
}
