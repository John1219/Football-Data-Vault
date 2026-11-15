import { useMemo, useState } from 'react';
import { Bar, Line, Scatter } from 'react-chartjs-2';
import { Play } from 'lucide-react';
import { vaultApi } from '../api';

const PRESETS: { label: string; sql: string; xCol?: string; yCol?: string; chart?: 'bar' | 'line' | 'scatter' }[] = [
  {
    label: '4th Down Go-For-It Rate (2024)',
    sql: `SELECT posteam,
       COUNT(*) AS fourth_downs,
       SUM(CASE WHEN play_type IN ('pass','run') THEN 1 ELSE 0 END) AS attempts,
       ROUND(AVG(CASE WHEN play_type IN ('pass','run') THEN 1.0 ELSE 0.0 END) * 100, 1) AS go_pct
FROM nfl_pbp
WHERE season = 2024 AND down = 4 AND posteam IS NOT NULL
GROUP BY posteam
ORDER BY go_pct DESC`,
    xCol: 'posteam',
    yCol: 'go_pct',
    chart: 'bar',
  },
  {
    label: 'Top Rushers by Total EPA (2024)',
    sql: `SELECT rusher_player_name AS rusher,
       ANY_VALUE(posteam) AS team,
       COUNT(*) AS carries,
       SUM(yards_gained) AS rush_yards,
       ROUND(SUM(epa), 2) AS total_epa
FROM nfl_pbp
WHERE season = 2024 AND rush_attempt = 1 AND rusher_player_name IS NOT NULL
GROUP BY rusher_player_name
HAVING COUNT(*) >= 100
ORDER BY total_epa DESC
LIMIT 20`,
    xCol: 'rusher',
    yCol: 'total_epa',
    chart: 'bar',
  },
  {
    label: 'Scoring Trend by Season',
    sql: `SELECT season,
       COUNT(*) AS games,
       ROUND(AVG(home_score + away_score), 2) AS avg_total_pts
FROM nfl_schedules
WHERE home_score IS NOT NULL AND away_score IS NOT NULL
GROUP BY season
ORDER BY season`,
    xCol: 'season',
    yCol: 'avg_total_pts',
    chart: 'line',
  },
  {
    label: 'Combine 40-Yard vs Weight (WR/RB)',
    sql: `SELECT player_name, pos, wt, forty
FROM nfl_combine
WHERE pos IN ('WR', 'RB') AND wt IS NOT NULL AND forty IS NOT NULL
LIMIT 250`,
    xCol: 'wt',
    yCol: 'forty',
    chart: 'scatter',
  },
];

export default function SqlChartStudio() {
  const [sql, setSql] = useState<string>(PRESETS[0].sql);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [chartType, setChartType] = useState<'none' | 'bar' | 'line' | 'scatter'>('bar');
  const [xCol, setXCol] = useState<string>('posteam');
  const [yCol, setYCol] = useState<string>('go_pct');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = async (overrideSql?: string, preset?: (typeof PRESETS)[number]) => {
    const querySql = overrideSql ?? sql;
    setLoading(true);
    setError(null);
    try {
      const res = await vaultApi.query(querySql);
      setColumns(res.columns);
      setRows(res.rows);
      if (preset) {
        if (preset.chart) setChartType(preset.chart);
        if (preset.xCol) setXCol(preset.xCol);
        if (preset.yCol) setYCol(preset.yCol);
      } else if (res.columns.length >= 2) {
        if (!res.columns.includes(xCol)) setXCol(res.columns[0]);
        if (!res.columns.includes(yCol)) setYCol(res.columns[1]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const scatterData = useMemo(() => {
    if (chartType !== 'scatter' || !xCol || !yCol || rows.length === 0) return null;
    return {
      datasets: [
        {
          label: `${yCol} vs ${xCol}`,
          data: rows
            .map((r) => ({ x: Number(r[xCol]), y: Number(r[yCol]) }))
            .filter((pt) => !Number.isNaN(pt.x) && !Number.isNaN(pt.y)),
          backgroundColor: '#38bdf8',
          pointRadius: 5,
        },
      ],
    };
  }, [chartType, xCol, yCol, rows]);

  const seriesData = useMemo(() => {
    if ((chartType !== 'bar' && chartType !== 'line') || !xCol || !yCol || rows.length === 0) {
      return null;
    }
    return {
      labels: rows.map((r) => String(r[xCol] ?? '')),
      datasets: [
        {
          label: yCol,
          data: rows.map((r) => Number(r[yCol] ?? 0)),
          backgroundColor: 'rgba(56, 189, 248, 0.75)',
          borderColor: '#38bdf8',
          borderRadius: 4,
          tension: 0.25,
        },
      ],
    };
  }, [chartType, xCol, yCol, rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-100">DuckDB SQL &amp; Dynamic Chart Studio</h2>
            <p className="text-xs text-slate-400">
              Query any Parquet-backed DuckDB view and plot results immediately.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setSql(p.sql);
                  void runQuery(p.sql, p);
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={6}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => void runQuery()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {loading ? 'Running...' : 'Run Query'}
          </button>

          {columns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">Chart:</span>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value as 'none' | 'bar' | 'line' | 'scatter')}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
              >
                <option value="none">Table Only</option>
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="scatter">Scatter</option>
              </select>
              <span className="text-slate-400">X:</span>
              <select
                value={xCol}
                onChange={(e) => setXCol(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">Y:</span>
              <select
                value={yCol}
                onChange={(e) => setYCol(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {(seriesData || scatterData) && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="h-72 w-full">
            {chartType === 'bar' && seriesData && (
              <Bar data={seriesData} options={{ responsive: true, maintainAspectRatio: false }} />
            )}
            {chartType === 'line' && seriesData && (
              <Line data={seriesData} options={{ responsive: true, maintainAspectRatio: false }} />
            )}
            {chartType === 'scatter' && scatterData && (
              <Scatter data={scatterData} options={{ responsive: true, maintainAspectRatio: false }} />
            )}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 text-xs text-slate-400">{rows.length} rows returned (limit 500)</div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr className="border-b border-slate-800">
                  {columns.map((c) => (
                    <th key={c} className="whitespace-nowrap py-2 pr-4 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 tabular-nums">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/40">
                    {columns.map((c) => (
                      <td key={c} className="whitespace-nowrap py-1.5 pr-4 text-slate-200">
                        {r[c] === null || r[c] === undefined ? '' : String(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
