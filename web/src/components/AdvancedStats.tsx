import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut, Scatter } from 'react-chartjs-2';
import type { Plugin } from 'chart.js';
import { vaultApi } from '../api';
import { getTeamMeta, NFL_TEAMS } from '../nflTeams';

type PositionTab = 'QB' | 'RB' | 'WR/TE' | 'DEF';

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

interface SkillStatRow {
  player: string;
  position: string;
  team: string;
  carries: number;
  rushing_yards: number;
  rushing_tds: number;
  rushing_epa: number;
  targets: number;
  receptions: number;
  receiving_yards: number;
  receiving_tds: number;
  receiving_epa: number;
  fantasy_points_ppr: number;
}

interface DefStatRow {
  player: string;
  position: string;
  team: string;
  def_sacks: number;
  def_interceptions: number;
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

function TeamBadge({ team }: { team: string }) {
  const meta = getTeamMeta(team);
  return (
    <span className="inline-flex items-center gap-1.5">
      <img
        src={meta.logoUrl}
        alt={meta.abbr}
        className="h-4 w-4 object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      <span
        className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
        style={{ backgroundColor: meta.color }}
      >
        {meta.abbr}
      </span>
    </span>
  );
}

export default function AdvancedStats() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(2026);
  const [posTab, setPosTab] = useState<PositionTab>('QB');

  const [teamEff, setTeamEff] = useState<TeamEfficiencyRow[]>([]);
  const [qbEff, setQbEff] = useState<QbEfficiencyRow[]>([]);
  const [rbStats, setRbStats] = useState<SkillStatRow[]>([]);
  const [wrStats, setWrStats] = useState<SkillStatRow[]>([]);
  const [defStats, setDefStats] = useState<DefStatRow[]>([]);
  const [capPos, setCapPos] = useState<CapPosRow[]>([]);
  const [weatherBuckets, setWeatherBuckets] = useState<WeatherBucketRow[]>([]);

  const [logoImages, setLogoImages] = useState<Record<string, HTMLImageElement>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Preload NFL team logos for canvas scatter rendering
  useEffect(() => {
    const imgs: Record<string, HTMLImageElement> = {};
    let loadedCount = 0;
    const entries = Object.values(NFL_TEAMS);
    entries.forEach((t) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imgs[t.abbr] = img;
        loadedCount++;
        if (loadedCount === entries.length || loadedCount % 8 === 0) {
          setLogoImages({ ...imgs });
        }
      };
      img.src = t.logoUrl;
    });
  }, []);

  // Load seasons and default to latest/current season
  useEffect(() => {
    vaultApi
      .query('SELECT DISTINCT season FROM nfl_pbp ORDER BY season DESC')
      .then((res) => {
        const list = res.rows.map((r) => Number(r.season)).filter((n) => !Number.isNaN(n));
        setSeasons(list);
        if (list.length > 0) setSeason(list[0]);
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
        HAVING COUNT(*) >= 75
        ORDER BY epa_per_play DESC
        LIMIT 32
      `),
      vaultApi.query(`
        SELECT player_display_name AS player,
               ANY_VALUE(position) AS position,
               ANY_VALUE(team) AS team,
               SUM(COALESCE(carries, 0)) AS carries,
               SUM(COALESCE(rushing_yards, 0)) AS rushing_yards,
               SUM(COALESCE(rushing_tds, 0)) AS rushing_tds,
               ROUND(SUM(COALESCE(rushing_epa, 0)), 2) AS rushing_epa,
               SUM(COALESCE(targets, 0)) AS targets,
               SUM(COALESCE(receptions, 0)) AS receptions,
               SUM(COALESCE(receiving_yards, 0)) AS receiving_yards,
               SUM(COALESCE(receiving_tds, 0)) AS receiving_tds,
               ROUND(SUM(COALESCE(receiving_epa, 0)), 2) AS receiving_epa,
               ROUND(SUM(COALESCE(fantasy_points_ppr, 0)), 1) AS fantasy_points_ppr
        FROM nfl_player_stats
        WHERE season = ${s} AND position = 'RB' AND player_display_name IS NOT NULL
        GROUP BY player_display_name
        HAVING SUM(COALESCE(carries, 0)) >= 30
        ORDER BY rushing_yards DESC
        LIMIT 32
      `),
      vaultApi.query(`
        SELECT player_display_name AS player,
               ANY_VALUE(position) AS position,
               ANY_VALUE(team) AS team,
               SUM(COALESCE(carries, 0)) AS carries,
               SUM(COALESCE(rushing_yards, 0)) AS rushing_yards,
               SUM(COALESCE(rushing_tds, 0)) AS rushing_tds,
               ROUND(SUM(COALESCE(rushing_epa, 0)), 2) AS rushing_epa,
               SUM(COALESCE(targets, 0)) AS targets,
               SUM(COALESCE(receptions, 0)) AS receptions,
               SUM(COALESCE(receiving_yards, 0)) AS receiving_yards,
               SUM(COALESCE(receiving_tds, 0)) AS receiving_tds,
               ROUND(SUM(COALESCE(receiving_epa, 0)), 2) AS receiving_epa,
               ROUND(SUM(COALESCE(fantasy_points_ppr, 0)), 1) AS fantasy_points_ppr
        FROM nfl_player_stats
        WHERE season = ${s} AND position IN ('WR', 'TE') AND player_display_name IS NOT NULL
        GROUP BY player_display_name
        HAVING SUM(COALESCE(targets, 0)) >= 20
        ORDER BY receiving_yards DESC
        LIMIT 32
      `),
      vaultApi.query(`
        SELECT player_display_name AS player,
               ANY_VALUE(position) AS position,
               ANY_VALUE(team) AS team,
               ROUND(SUM(COALESCE(def_sacks, 0)), 1) AS def_sacks,
               SUM(COALESCE(def_interceptions, 0)) AS def_interceptions
        FROM nfl_player_stats
        WHERE season = ${s} AND player_display_name IS NOT NULL
        GROUP BY player_display_name
        HAVING (SUM(COALESCE(def_sacks, 0)) + SUM(COALESCE(def_interceptions, 0)) * 2) > 0
        ORDER BY (SUM(COALESCE(def_sacks, 0)) + SUM(COALESCE(def_interceptions, 0)) * 2) DESC
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
      .then(([teamRes, qbRes, rbRes, wrRes, defRes, capRes, weatherRes]) => {
        setTeamEff(teamRes.rows as unknown as TeamEfficiencyRow[]);
        setQbEff(qbRes.rows as unknown as QbEfficiencyRow[]);
        setRbStats(rbRes.rows as unknown as SkillStatRow[]);
        setWrStats(wrRes.rows as unknown as SkillStatRow[]);
        setDefStats(defRes.rows as unknown as DefStatRow[]);
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
          label: 'NFL Teams',
          data: teamEff.map((t) => ({
            x: t.off_epa,
            y: t.def_epa,
            team: t.team,
            passRate: t.pass_rate,
          })),
          backgroundColor: teamEff.map((t) => getTeamMeta(t.team).color),
          pointRadius: 12,
          pointHoverRadius: 15,
        },
      ],
    }),
    [teamEff]
  );

  const teamLogoPlugin: Plugin<'scatter'> = useMemo(
    () => ({
      id: 'teamLogosAndQuadrants',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x || !scales.y) return;
        const xZero = scales.x.getPixelForValue(0);
        const yZero = scales.y.getPixelForValue(0);

        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        if (xZero >= chartArea.left && xZero <= chartArea.right) {
          ctx.beginPath();
          ctx.moveTo(xZero, chartArea.top);
          ctx.lineTo(xZero, chartArea.bottom);
          ctx.stroke();
        }
        if (yZero >= chartArea.top && yZero <= chartArea.bottom) {
          ctx.beginPath();
          ctx.moveTo(chartArea.left, yZero);
          ctx.lineTo(chartArea.right, yZero);
          ctx.stroke();
        }

        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = 'rgba(52, 211, 153, 0.45)';
        ctx.textAlign = 'right';
        ctx.fillText('ELITE (Good Off + Good Def)', chartArea.right - 8, chartArea.top + 14);
        ctx.fillStyle = 'rgba(248, 113, 113, 0.45)';
        ctx.textAlign = 'left';
        ctx.fillText('STRUGGLING', chartArea.left + 8, chartArea.bottom - 8);
        ctx.restore();
      },
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta?.data) return;

        meta.data.forEach((pt, idx) => {
          const raw = chart.data.datasets[0].data[idx] as { team?: string } | undefined;
          const abbr = raw?.team ?? '';
          const img = logoImages[abbr];
          const { x, y } = pt.getProps(['x', 'y'], true);

          ctx.save();
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, x - 13, y - 13, 26, 26);
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(abbr, x, y);
          }
          ctx.restore();
        });
      },
    }),
    [logoImages]
  );

  const teamScatterOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { raw: unknown }) => {
              const r = ctx.raw as { x: number; y: number; team: string; passRate: number };
              const meta = getTeamMeta(r.team);
              return `${meta.abbr} (${meta.name}): Off EPA ${r.x.toFixed(3)} | Def EPA ${r.y.toFixed(3)} | Pass ${r.passRate}%`;
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
          title: { display: true, text: 'Defensive EPA / Play Allowed (Higher = Better)', color: '#94a3b8' },
        },
      },
    }),
    []
  );

  // Dynamic position bar chart
  const positionBarData = useMemo(() => {
    if (posTab === 'QB') {
      const top = qbEff.slice(0, 16);
      return {
        labels: top.map((q) => `${q.passer} (${q.team})`),
        datasets: [
          {
            label: 'EPA / Dropback',
            data: top.map((q) => q.epa_per_play),
            backgroundColor: top.map((q) => getTeamMeta(q.team).color),
            borderColor: top.map((q) => getTeamMeta(q.team).altColor),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      };
    }
    if (posTab === 'RB') {
      const top = rbStats.slice(0, 16);
      return {
        labels: top.map((r) => `${r.player} (${r.team})`),
        datasets: [
          {
            label: 'Rushing Yards',
            data: top.map((r) => r.rushing_yards),
            backgroundColor: top.map((r) => getTeamMeta(r.team).color),
            borderColor: top.map((r) => getTeamMeta(r.team).altColor),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      };
    }
    if (posTab === 'WR/TE') {
      const top = wrStats.slice(0, 16);
      return {
        labels: top.map((w) => `${w.player} (${w.team})`),
        datasets: [
          {
            label: 'Receiving Yards',
            data: top.map((w) => w.receiving_yards),
            backgroundColor: top.map((w) => getTeamMeta(w.team).color),
            borderColor: top.map((w) => getTeamMeta(w.team).altColor),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      };
    }
    const top = defStats.slice(0, 16);
    return {
      labels: top.map((d) => `${d.player} (${d.team})`),
      datasets: [
        {
          label: 'Sacks',
          data: top.map((d) => d.def_sacks),
          backgroundColor: top.map((d) => getTeamMeta(d.team).color),
          borderRadius: 4,
        },
        {
          label: 'Interceptions',
          data: top.map((d) => d.def_interceptions),
          backgroundColor: '#fbbf24',
          borderRadius: 4,
        },
      ],
    };
  }, [posTab, qbEff, rbStats, wrStats, defStats]);

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
            Team efficiency with official NFL logos &amp; colors, multi-position player leaderboards, contracts, and weather impact.
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
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center text-xs text-slate-400">
          Computing DuckDB aggregations for {season}...
        </div>
      )}

      {/* Row 1: Team Efficiency Matrix + Position Leaders Chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Team Efficiency Matrix (EPA/Play — {season})
          </h3>
          <p className="mb-3 text-xs text-slate-400">
            Official team logos plotted by Offensive EPA/Play vs. Defensive EPA/Play allowed.
          </p>
          <div className="h-80 w-full">
            <Scatter data={teamScatterData} options={teamScatterOptions} plugins={[teamLogoPlugin]} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Position Leaders ({season})
              </h3>
              <p className="text-xs text-slate-400">Bars colored by player&apos;s NFL team.</p>
            </div>
            <div className="flex gap-1 rounded-lg bg-slate-950 p-1">
              {(['QB', 'RB', 'WR/TE', 'DEF'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPosTab(tab)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    posTab === tab
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="h-72 w-full">
            <Bar
              data={positionBarData}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: posTab === 'DEF' } },
              }}
            />
          </div>
        </div>
      </div>

      {/* Position Leaderboard Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">
            {posTab} Leaderboard ({season})
          </h3>
        </div>
        <div className="max-h-80 overflow-auto">
          {posTab === 'QB' && (
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
                    <td className="py-2 pr-3"><TeamBadge team={q.team} /></td>
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
          )}

          {posTab === 'RB' && (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3">Carries</th>
                  <th className="py-2 pr-3">Rush Yds</th>
                  <th className="py-2 pr-3">YPC</th>
                  <th className="py-2 pr-3">Rush TD</th>
                  <th className="py-2 pr-3">Rush EPA</th>
                  <th className="py-2 pr-3">Rec Yds</th>
                  <th className="py-2 pr-3">PPR Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 tabular-nums">
                {rbStats.map((r) => (
                  <tr key={`${r.player}-${r.team}`} className="hover:bg-slate-800/40">
                    <td className="py-2 pr-3 font-medium text-slate-100">{r.player}</td>
                    <td className="py-2 pr-3"><TeamBadge team={r.team} /></td>
                    <td className="py-2 pr-3 text-slate-300">{r.carries}</td>
                    <td className="py-2 pr-3 font-semibold text-sky-400">{r.rushing_yards}</td>
                    <td className="py-2 pr-3 text-slate-300">
                      {r.carries > 0 ? (r.rushing_yards / r.carries).toFixed(2) : '0.00'}
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{r.rushing_tds}</td>
                    <td className={`py-2 pr-3 font-semibold ${r.rushing_epa >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.rushing_epa}
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{r.receiving_yards}</td>
                    <td className="py-2 pr-3 text-amber-300">{r.fantasy_points_ppr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {posTab === 'WR/TE' && (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Pos</th>
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3">Targets</th>
                  <th className="py-2 pr-3">Rec</th>
                  <th className="py-2 pr-3">Rec Yds</th>
                  <th className="py-2 pr-3">Rec TD</th>
                  <th className="py-2 pr-3">Rec EPA</th>
                  <th className="py-2 pr-3">PPR Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 tabular-nums">
                {wrStats.map((w) => (
                  <tr key={`${w.player}-${w.team}`} className="hover:bg-slate-800/40">
                    <td className="py-2 pr-3 font-medium text-slate-100">{w.player}</td>
                    <td className="py-2 pr-3 text-slate-400">{w.position}</td>
                    <td className="py-2 pr-3"><TeamBadge team={w.team} /></td>
                    <td className="py-2 pr-3 text-slate-300">{w.targets}</td>
                    <td className="py-2 pr-3 text-slate-300">{w.receptions}</td>
                    <td className="py-2 pr-3 font-semibold text-sky-400">{w.receiving_yards}</td>
                    <td className="py-2 pr-3 text-slate-300">{w.receiving_tds}</td>
                    <td className={`py-2 pr-3 font-semibold ${w.receiving_epa >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {w.receiving_epa}
                    </td>
                    <td className="py-2 pr-3 text-amber-300">{w.fantasy_points_ppr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {posTab === 'DEF' && (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Pos</th>
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3">Sacks</th>
                  <th className="py-2 pr-3">Interceptions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 tabular-nums">
                {defStats.map((d) => (
                  <tr key={`${d.player}-${d.team}`} className="hover:bg-slate-800/40">
                    <td className="py-2 pr-3 font-medium text-slate-100">{d.player}</td>
                    <td className="py-2 pr-3 text-slate-400">{d.position}</td>
                    <td className="py-2 pr-3"><TeamBadge team={d.team} /></td>
                    <td className="py-2 pr-3 font-semibold text-sky-400">{d.def_sacks}</td>
                    <td className="py-2 pr-3 font-semibold text-amber-400">{d.def_interceptions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row 3: Contracts & Weather */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
    </div>
  );
}
