import type { ChangeLogEntry } from '../types';

export function ChangeTable({ rows, showFeature }: { rows: ChangeLogEntry[]; showFeature?: boolean }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No changes recorded yet.</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase text-slate-500">
        <tr>
          <th className="py-1 pr-3">When</th>
          <th className="pr-3">Who</th>
          {showFeature && <th className="pr-3">Feature</th>}
          <th className="pr-3">What</th>
          <th className="pr-3">From</th>
          <th className="pr-3">To</th>
          <th>Why</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
            <td className="whitespace-nowrap py-1 pr-3">{new Date(r.changedAt).toLocaleString('en-GB')}</td>
            <td className="pr-3">{r.changedBy}</td>
            {showFeature && <td className="pr-3">{r.featureName ?? '-'}</td>}
            <td className="pr-3 font-mono text-xs">{r.field}</td>
            <td className="pr-3 text-slate-500">{r.fromValue ?? '-'}</td>
            <td className="pr-3">{r.toValue ?? '-'}</td>
            <td className="text-slate-500">{r.reason ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
