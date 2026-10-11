import { capacityByWeek, levelOf, type LoadLevel } from '../schedule';
import { SettingsBar } from '../components/SettingsBar';
import { fmtDate } from '../weeks';
import type { AppState } from '../types';

const CELL: Record<LoadLevel, string> = {
  over: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  ok: '',
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function Capacity({ state }: { state: AppState }) {
  const { settings, weeks, features, currentWeek } = state;
  const rows = capacityByWeek(features, weeks, settings);
  const fillers = features.filter((f) => f.isFiller);
  const anyResources = features.some((f) => f.resources.length > 0);

  return (
    <div>
      <SettingsBar settings={settings} />
      {!anyResources && (
        <p className="mb-4 rounded bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          No resources entered yet, so everything shows as free. Open a feature and fill "Resources needed per week".
        </p>
      )}
      <div className="card overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Week</th>
              <th>BE allocated</th>
              <th>BE free</th>
              <th>FE allocated</th>
              <th>FE free</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const be = levelOf(r.freeBe, settings.lowThreshold);
              const fe = levelOf(r.freeFe, settings.lowThreshold);
              const isNow = r.week.code === currentWeek;
              return (
                <tr key={r.week.code} className={`border-t border-slate-100 dark:border-slate-800 ${isNow ? 'font-medium' : ''}`}>
                  <td className="py-2">
                    {r.week.code} <span className="text-xs text-slate-500">{fmtDate(r.week.startDate)}</span>
                    {isNow && <span className="ml-2 rounded bg-red-500 px-1 text-[10px] text-white">now</span>}
                  </td>
                  <td>
                    {fmt(r.be)} / {settings.beTotal}
                  </td>
                  <td className={`px-2 ${CELL[be]}`}>{fmt(r.freeBe)}{be === 'over' && ' over'}</td>
                  <td>
                    {fmt(r.fe)} / {settings.feTotal}
                  </td>
                  <td className={`px-2 ${CELL[fe]}`}>{fmt(r.freeFe)}{fe === 'over' && ' over'}</td>
                  <td className="text-xs text-slate-500">
                    {(be === 'low' || fe === 'low') && fillers.length > 0 && (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Free capacity: suggest {fillers.map((f) => f.name).join(', ')}.{' '}
                      </span>
                    )}
                    {r.missingInput.length > 0 && <span>No resources set for: {r.missingInput.join(', ')}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          Red = over-allocated. Green = free above {settings.lowThreshold} (low workload). Change the threshold above.
        </p>
      </div>
    </div>
  );
}
