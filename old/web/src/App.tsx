import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { getUser } from './user';
import FeatureList from './pages/FeatureList';
import Timeline from './pages/Timeline';
import Capacity from './pages/Capacity';
import ChangeLog from './pages/ChangeLog';

type Tab = 'features' | 'timeline' | 'capacity' | 'changelog';

function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem('scrum-dashboard-dark') === '1');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('scrum-dashboard-dark', dark ? '1' : '0');
  }, [dark]);
  return [dark, setDark] as const;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('features');
  const [dark, setDark] = useDarkMode();
  const [user, setUserState] = useState(getUser());
  const { data: state, isLoading, error, refetch } = useQuery({ queryKey: ['state'], queryFn: api.getState });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'features', label: 'Features' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'capacity', label: 'Capacity' },
    { key: 'changelog', label: 'Change log' },
  ];

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">Scrum Planning Dashboard</h1>
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`rounded px-3 py-1.5 text-sm ${
                  tab === t.key
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {state && !state.jiraConfigured && (
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Jira not configured
            </span>
          )}
          <button
            className="text-slate-500 underline-offset-2 hover:underline"
            onClick={() => {
              const name = window.prompt('Your name:', user);
              if (name?.trim()) {
                localStorage.setItem('scrum-dashboard-user', name.trim());
                setUserState(name.trim());
              }
            }}
          >
            {user}
          </button>
          <button className="btn" onClick={() => setDark(!dark)}>
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className="p-6">
        {isLoading && <p className="text-slate-500">Loading...</p>}
        {error && <p className="text-red-600">{(error as Error).message}</p>}
        {state && (
          <>
            {tab === 'features' && <FeatureList state={state} onChanged={refetch} />}
            {tab === 'timeline' && <Timeline state={state} />}
            {tab === 'capacity' && <Capacity state={state} />}
            {tab === 'changelog' && <ChangeLog />}
          </>
        )}
      </main>
    </div>
  );
}
