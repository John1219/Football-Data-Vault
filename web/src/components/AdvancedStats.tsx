import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut, Scatter } from 'react-chartjs-2';
import { vaultApi } from '../api';

interface TeamEfficiencyRow {
  team: string;
  off_epa: number;
  def_epa: number;
  pass_rate: number;
  plays: number;
}

interface QbEfficiencyRow {
  passer: string;
  team: string;
  dropbacks: number;
  epa_per_play: number;
  avg_air_yards: number;
  comp_pct: number;
  tds: number;
  ints: number;
}

interface CapPosRow {
  position: string;
  total_apy: number;
  players: number;
}

interface WeatherBucketRow {
  wind_bucket: string;
  games: number;
  avg_total: number;
}

export default function AdvancedStats() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(2024);
  const [teamEff, setTeamEff] = useState<TeamEfficiencyRow[]>([]);
  const [qbEff, setQbEff] = useState<QbEfficiencyRow[]>([]);
  const [capPos, setCapPos] = useState<CapPosRow[]>([]);
  const [weatherBuckets, setWeatherBuckets] = useState<WeatherBucketRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vaultApi
      .query('SELECT DISTINCT season FROM nfl_pbp ORDER BY season DESC')
      .then((res) => {
        const list = res.rows.map((r) => Number(r.season)).filter((n) => !Number.isNaN(n));
        setSeasons(list);
        if (list.length > 0) setSeason(list.includes(2024) ? 2024 : list[0]);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!season) return;
    setLoading(true);
    setError(null);

    const s = Number(season);

    Promise.all([
      vaultApi.query(`
        WITH off AS (
          SELECT posteam AS team,
                 ROUND(AVG(epa), 4) AS off_epa,
                 ROUND(AVG(CASE WHEN play_type = 'pass' THEN 1.0 ELSE 0.0 END) * 100, 1) AS pass_rate,
                 COUNT(*) AS plays
          FROM nfl_pbp
          WHERE season = ${s} AND play_type IN ('pass', 'run') AND posteam IS NOT NULL AND epa IS NOT NULL
          GROUP BY posteam
        ),
        def AS (
          SELECT defteam AS team,
                 ROUND(AVG(epa), 4) AS def_epa
          FROM nfl_pbp
          WHERE season = ${s} AND play_type IN ('pass', 'run') AND defteam IS NOT NULL AND epa IS NOT NULL
          GROUP BY defteam
        )
        SELECT off.team, off.off_epa, def.def_epa, off.pass_rate, off.plays
        FROM off JOIN def ON off.team = def.team
        ORDER BY off.off_epa DESC
      `),
      vaultApi.query(`
        SELECT passer_player_name AS passer,
               ANY_VALUE(posteam) AS team,
               COUNT(*) AS dropbacks,
               ROUND(AVG(epa), 3) AS epa_per_play,
               ROUND(AVG(air_yards), 2) AS avg_air_yards,
               ROUND(AVG(COALESCE(complete_pass, 0)) * 100, 1) AS comp_pct,
               SUM(COALESCE(pass_touchdown, 0)) AS tds,
               SUM(COALESCE(interception, 0)) AS ints
        FROM nfl_pbp
        WHERE season = ${s} AND pass_attempt = 1 AND passer_player_name IS NOT NULL AND epa IS NOT NULL
        GROUP BY passer_player_name
        HAVING COUNT(*) >= 120
        ORDER BY epa_per_play DESC
        LIMIT 32
      `),
      vaultApi.query(`
        SELECT position,
               ROUND(SUM(apy), 2) AS total_apy,
               COUNT(*) AS players
        FROM nfl_contracts
        WHERE is_active = true AND position IS NOT NULL AND apy IS NOT NULL
        GROUP BY position
        ORDER BY total_apy DESC
        LIMIT 10
      `),
      vaultApi.query(`
        SELECT CASE
                 WHEN COALESCE(w.wind_mph, s.wind, 0) < 8 THEN 'Calm (<8 mph)'
                 WHEN COALESCE(w.wind_mph, s.wind, 0) < 15 THEN 'Moderate (8-15 mph)'
                 ELSE 'Windy (15+ mph)'
               END AS wind_bucket,
               COUNT(*) AS games,
               ROUND(AVG(s.home_score + s.away_score), 1) AS avg_total
        FROM nfl_schedules s
        LEFT JOIN nfl_weather w ON s.game_id = w.game_id
        WHERE s.season = ${s} AND s.home_score IS NOT NULL AND s.away_score IS NOT NULL
        GROUP BY 1
        ORDER BY avg_total DESC
      `),
    ])
      .then(([teamRes, qbRes, capRes, weatherRes]) => {
        setTeamEff(teamRes.rows as unknown as TeamEfficiencyRow[]);
        setQbEff(qbRes.rows as unknown as QbEfficiencyRow[]);
        setCapPos(capRes.rows as unknown as CapPosRow[]);
        setWeatherBuckets(weatherRes.rows as unknown as WeatherBucketRow[]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [season]);

  const teamScatterData = useMemo(
    () => ({
      datasets: [
        {
          label: 'NFL Teams (Off EPA/Play vs Def EPA/Play allowed)',
          data: teamEff.map((t) => ({
            x: t.off_epa,
            y: t.def_epa,
            team: t.team,
            passRate: t.pass_rate,
          })),
          backgroundColor: teamEff.map((t) =>
            t.off_epa >= 0 && t.def_epa <= 0
              ? '#34d399'
              : t.off_epa >= 0
                ? '#38bdf8'
                : t.def_epa <= 0
                  ? '#fbbf24'
                  : '#f87171'
          ),
          pointRadius: 7,
          pointHoverRadius: 9,
        },
      ],
    }),
    [teamEff]
  );

  const teamScatterOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx: { raw: unknown }) => {
              const r = ctx.raw as { x: number; y: number; team: string; passRate: number };
              return `${r.team}: Off EPA ${r.x.toFixed(3)} | Def EPA ${r.y.toFixed(3)} | Pass ${r.passRate}%`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Offensive EPA / Play (Higher = Better)', color: '#94a3b8' },
        },
        y: {
          reverse: true,
          title: { display: true, text: 'Defensive EPA / Play Allowed (Higher on chart = Better)', color: '#94a3b8' },
        },
      },
    }),
    []
  );

  const qbBarData = useMemo(
    () => ({
      labels: qbEff.slice(0, 16).map((q) => `${q.passer} (${q.team})`),
      datasets: [
        {
          label: 'EPA / Dropback',
          data: qbEff.slice(0, 16).map((q) => q.epa_per_play),
          backgroundColor: qbEff.slice(0, 16).map((q) => (q.epa_per_play >= 0 ? '#38bdf8' : '#f87171')),
          borderRadius: 4,
        },
      ],
    }),
    [qbEff]
  );

  const capDoughnutData = useMemo(
    () => ({
      labels: capPos.map((c) => c.position),
      datasets: [
        {
          data: capPos.map((c) => c.total_apy),
          backgroundColor: [
            '#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#f472b6',
            '#fb7185', '#2dd4bf', '#60a5fa', '#facc15', '#94a3b8',
          ],
          borderWidth: 0,
        },
      ],
    }),
    [capPos]
  );

  const weatherBarData = useMemo(
    () => ({
      labels: weatherBuckets.map((w) => `${w.wind_bucket} (${w.games}g)`),
      datasets: [
        {
          label: 'Avg Combined Points',
          data: weatherBuckets.map((w) => w.avg_total),
          backgroundColor: ['#34d399', '#38bdf8', '#f59e0b'],
          borderRadius: 6,
        },
      ],
    }),
    [weatherBuckets]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Advanced NFL Analytics</h2>
          <p className="text-xs text-slate-400">
            Powered live by DuckDB over Parquet play-by-play, schedules, weather, and contract datasets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-400">Season</label>
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
          Computing DuckDB aggregations for {season}...
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Team Efficiency Matrix (EPA/Play — {season})
          </h3>
          <p className="mb-3 text-xs text-slate-400">
            Top-right quadrant (green) = elite offense + elite defense. Hover points for team details.
          </p>
          <div className="h-72 w-full">
            <Scatter data={teamScatterData} options={teamScatterOptions} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Top QBs by EPA / Dropback ({season}, min 120 dropbacks)
          </h3>
          <p className="mb-3 text-xs text-slate-400">Expected Points Added per pass attempt or sack.</p>
          <div className="h-72 w-full">
            <Bar
              data={qbBarData}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Active NFL Contract APY by Position ($M)
          </h3>
          <p className="mb-3 text-xs text-slate-400">Aggregated from `nfl_contracts` active deals.</p>
          <div className="h-64 w-full">
            <Doughnut
              data={capDoughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } },
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Wind Speed vs. Total Game Scoring ({season})
          </h3>
          <p className="mb-3 text-xs text-slate-400">
            Joined from `nfl_schedules` and `nfl_weather` (Open-Meteo).
          </p>
          <div className="h-64 w-full">
            <Bar
              data={weatherBarData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>
      </div>

      {/* QB Leaderboard Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Quarterback Efficiency Leaderboard ({season})
        </h3>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="py-2 pr-3">Passer</th>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3">Dropbacks</th>
                <th className="py-2 pr-3">EPA/Play</th>
                <th className="py-2 pr-3">Avg Air Yds</th>
                <th className="py-2 pr-3">Comp %</th>
                <th className="py-2 pr-3">TD</th>
                <th className="py-2 pr-3">INT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 tabular-nums">
              {qbEff.map((q) => (
                <tr key={`${q.passer}-${q.team}`} className="hover:bg-slate-800/40">
                  <td className="py-2 pr-3 font-medium text-slate-100">{q.passer}</td>
                  <td className="py-2 pr-3 text-slate-300">{q.team}</td>
                  <td className="py-2 pr-3 text-slate-300">{q.dropbacks}</td>
                  <td className={`py-2 pr-3 font-semibold ${q.epa_per_play >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {q.epa_per_play}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{q.avg_air_yards}</td>
                  <td className="py-2 pr-3 text-slate-300">{q.comp_pct}%</td>
                  <td className="py-2 pr-3 text-slate-300">{q.tds}</td>
                  <td className="py-2 pr-3 text-slate-300">{q.ints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
