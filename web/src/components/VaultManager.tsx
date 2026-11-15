import { useEffect, useState } from 'react';
import { Database, Film, RefreshCw, Upload } from 'lucide-react';
import { IngestionRun, MediaAsset, vaultApi } from '../api';

interface ViewCount {
  view: string;
  count: number | string;
}

export default function VaultManager() {
  const [views, setViews] = useState<ViewCount[]>([]);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [syncSeasons, setSyncSeasons] = useState<string>('2024, 2025');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);

  // Media registration form
  const [title, setTitle] = useState<string>('');
  const [mediaType, setMediaType] = useState<'video' | 'image' | 'audio'>('video');
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [sourceName, setSourceName] = useState<string>('');
  const [teamAbbr, setTeamAbbr] = useState<string>('');
  const [season, setSeason] = useState<string>('');

  const loadAll = async () => {
    try {
      const [vRes, rRes, mRes] = await Promise.all([
        vaultApi.views(),
        vaultApi.runs(20),
        vaultApi.mediaList(),
      ]);
      setRuns(rRes);
      setMedia(mRes);

      if (vRes.views.length > 0) {
        const unionSql = vRes.views
          .map((v) => `SELECT '${v}' AS view_name, COUNT(*) AS cnt FROM "${v}"`)
          .join(' UNION ALL ');
        const cntRes = await vaultApi.query(unionSql);
        setViews(
          cntRes.rows.map((r) => ({
            view: String(r.view_name),
            count: Number(r.cnt),
          }))
        );
      }
    } catch (e) {
      setSyncMessage(`Error loading vault status: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const parseSeasons = () =>
    syncSeasons
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n) && n > 1900);

  const runSync = async (label: string, fn: () => Promise<unknown>) => {
    setSyncing(true);
    setSyncMessage(`Running ${label}...`);
    try {
      const res = await fn();
      setSyncMessage(`${label} completed: ${JSON.stringify(res)}`);
      await loadAll();
    } catch (e) {
      setSyncMessage(`${label} failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRegisterMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !sourceUrl.trim()) return;
    try {
      await vaultApi.mediaRegister({
        title: title.trim(),
        media_type: mediaType,
        is_local_file: false,
        source_url: sourceUrl.trim(),
        source_name: sourceName.trim() || null,
        license_name: 'Link-Only',
        team_abbr: teamAbbr.trim().toUpperCase() || null,
        season: season ? Number(season) : null,
      });
      setTitle('');
      setSourceUrl('');
      setSourceName('');
      setTeamAbbr('');
      setSeason('');
      await loadAll();
    } catch (err) {
      setSyncMessage(`Media register failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dataset Inventory */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">DuckDB Parquet Views</h2>
          </div>
          <button
            onClick={() => void loadAll()}
            className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {views.map((v) => (
            <div key={v.view} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="truncate font-mono text-xs text-sky-400">{v.view}</div>
              <div className="mt-1 tabular-nums text-lg font-bold text-slate-100">
                {typeof v.count === 'number' ? v.count.toLocaleString() : v.count}
              </div>
              <div className="text-[11px] text-slate-500">rows</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sync Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-base font-bold text-slate-100">Data Ingestion &amp; Sync</h2>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-400">
            Target Seasons (comma-separated):
            <input
              value={syncSeasons}
              onChange={(e) => setSyncSeasons(e.target.value)}
              className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={syncing}
            onClick={() => void runSync('Current Season Sync', () => vaultApi.syncCurrent())}
            className="rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            Sync Current Season
          </button>
          <button
            disabled={syncing}
            onClick={() => void runSync('NFL Sync', () => vaultApi.syncNfl(parseSeasons()))}
            className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Sync NFL
          </button>
          <button
            disabled={syncing}
            onClick={() => void runSync('CFB Sync', () => vaultApi.syncCfb(parseSeasons()))}
            className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Sync CFB
          </button>
          <button
            disabled={syncing}
            onClick={() => void runSync('Sleeper Sync', () => vaultApi.syncSleeper())}
            className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Sync Sleeper
          </button>
          <button
            disabled={syncing}
            onClick={() => void runSync('Weather Sync', () => vaultApi.syncWeather(parseSeasons()))}
            className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Sync Weather
          </button>
        </div>
        {syncMessage && (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
            {syncMessage}
          </pre>
        )}
      </div>

      {/* Recent Ingestion Runs */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-base font-bold text-slate-100">Recent Ingestion Runs</h2>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Dataset</th>
                <th className="py-2 pr-3">Season</th>
                <th className="py-2 pr-3">Rows</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Synced At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 tabular-nums">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3 font-medium text-slate-200">{r.source}</td>
                  <td className="py-2 pr-3 text-slate-300">{r.dataset}</td>
                  <td className="py-2 pr-3 text-slate-300">{r.season ?? 'all'}</td>
                  <td className="py-2 pr-3 text-slate-300">{r.row_count.toLocaleString()}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        r.status === 'success'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-rose-950 text-rose-300'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-400">
                    {new Date(r.synced_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Media Vault */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">Media Vault ({media.length})</h2>
          </div>
          <button
            onClick={() => void runSync('Local Media Scan', () => vaultApi.mediaScan())}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
          >
            <Upload className="h-3.5 w-3.5" />
            Scan Local Media
          </button>
        </div>

        <form onSubmit={handleRegisterMedia} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-6">
          <input
            required
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 sm:col-span-2"
          />
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as 'video' | 'image' | 'audio')}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
          >
            <option value="video">Video</option>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
          </select>
          <input
            required
            placeholder="External URL"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 sm:col-span-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400"
          >
            Register Link
          </button>
        </form>

        {media.length === 0 ? (
          <p className="text-xs text-slate-400">
            No media assets registered yet. Drop files in `./data/media` and click Scan Local Media, or register a link above.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((m) => (
              <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="text-sm font-semibold text-slate-100">{m.title}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {m.media_type} • {m.team_abbr ?? 'ALL'} • {m.season ?? ''}
                </div>
                {m.is_local_file ? (
                  m.media_type === 'image' ? (
                    <img
                      src={vaultApi.mediaFileUrl(m.id)}
                      alt={m.title}
                      className="mt-2 max-h-40 w-full rounded object-cover"
                    />
                  ) : m.media_type === 'video' ? (
                    <video
                      controls
                      src={vaultApi.mediaFileUrl(m.id)}
                      className="mt-2 max-h-40 w-full rounded"
                    />
                  ) : (
                    <audio controls src={vaultApi.mediaFileUrl(m.id)} className="mt-2 w-full" />
                  )
                ) : (
                  m.source_url && (
                    <a
                      href={m.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-sky-400 hover:underline"
                    >
                      Open External Link →
                    </a>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
