import { useEffect, useState } from 'react';
import { Activity, BarChart3, Database, PlayCircle, Terminal } from 'lucide-react';
import { HealthStatus, vaultApi } from './api';
import AdvancedStats from './components/AdvancedStats';
import PlayRecreator from './components/PlayRecreator';
import SqlChartStudio from './components/SqlChartStudio';
import VaultManager from './components/VaultManager';

type TabId = 'recreator' | 'analytics' | 'sql' | 'vault';

const TABS: { id: TabId; label: string; icon: typeof PlayCircle }[] = [
  { id: 'recreator', label: 'Play-by-Play Recreator', icon: PlayCircle },
  { id: 'analytics', label: 'Advanced Analytics', icon: BarChart3 },
  { id: 'sql', label: 'SQL & Chart Studio', icon: Terminal },
  { id: 'vault', label: 'Vault & Media Manager', icon: Database },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('recreator');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<boolean>(false);

  useEffect(() => {
    vaultApi
      .health()
      .then((h) => {
        setHealth(h);
        setHealthError(false);
      })
      .catch(() => setHealthError(true));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">
                Football Data Vault Studio
              </h1>
              <p className="text-xs text-slate-400">
                Play-by-Play Field Recreator • Advanced Analytics • DuckDB Explorer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {healthError ? (
              <span className="rounded-full bg-rose-950 px-3 py-1 text-xs font-semibold text-rose-300">
                API Offline
              </span>
            ) : health ? (
              <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-300">
                PG {health.postgres ? 'OK' : 'ERR'} • DuckDB {health.duckdb ? 'OK' : 'ERR'}
              </span>
            ) : (
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
                Connecting...
              </span>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        {activeTab === 'recreator' && <PlayRecreator />}
        {activeTab === 'analytics' && <AdvancedStats />}
        {activeTab === 'sql' && <SqlChartStudio />}
        {activeTab === 'vault' && <VaultManager />}
      </main>
    </div>
  );
}
