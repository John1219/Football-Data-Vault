import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Compass } from 'lucide-react';
import { vaultApi } from '../api';

interface SituationRow {
  situation: string;
  sort_order: number;
  team_pass_pct: number;
  league_pass_pct: number;
  team_plays: number;
}

interface PassZoneRow {
  pass_length: string;
  pass_location: string;
  targets: number;
  epa_per_play: number;
  comp_pct: number;
}

interface RunGapRow {
  gap_label: string;
  sort_order: number;
  carries: number;
  ypc: number;
  epa_per_rush: number;
}

interface SummaryKpi {
  pass_rate: number;
  early_pass_rate: number;
  shotgun_rate: number;
  no_huddle_rate: number;
  rz_pass_rate: number;
  lg_pass_rate: number;
  lg_early_pass_rate: number;
  lg_shotgun_rate: number;
}

export default function TendenciesLab() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(2026);
  const [teams, setTeams] = useState<string[]>([]);
  const [team, setTeam] = useState<string>('KC');

  const [kpi, setKpi] = useState<SummaryKpi | null>(null);
  const [situations, setSituations] = useState<SituationRow[]>([]);
  const [passZones, setPassZones] = useState<PassZoneRow[]>([]);
  const [runGaps, setRunGaps] = useState<RunGapRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      vaultApi.query('SELECT DISTINCT season FROM nfl_pbp ORDER BY season DESC'),
      vaultApi.query(
        'SELECT DISTINCT posteam AS team FROM nfl_pbp WHERE posteam IS NOT NULL ORDER BY posteam'
      ),
    ])
      .then(([sRes, tRes]) => {
        const sList = sRes.rows.map((r) => Number(r.season)).filter((n) => !Number.isNaN(n));
        setSeasons(sList);
        if (sList.length > 0) setSeason(sList[0]);

        const tList = tRes.rows.map((r) => String(r.team));
        setTeams(tList);
        if (tList.length > 0 && !tList.includes(team)) setTeam(tList[0]);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!season || !team) return;
    setLoading(true);
    setError(null);
    const s = Number(season);
    const safeTeam = team.replace(/'/g, "''");

    Promise.all([
      vaultApi.query(`
        SELECT
          ROUND(AVG(CASE WHEN posteam = '${safeTeam}' AND play_type = 'pass' THEN 100.0 WHEN posteam = '${safeTeam}' THEN 0.0 END), 1) AS pass_rate,
          ROUND(AVG(CASE WHEN posteam = '${safeTeam}' AND down IN (1,2) AND play_type = 'pass' THEN 100.0 WHEN posteam = '${safeTeam}' AND down IN (1,2) THEN 0.0 END), 1) AS early_pass_rate,
          ROUND(AVG(CASE WHEN posteam = '${safeTeam}' THEN COALESCE(shotgun, 0) * 100.0 END), 1) AS shotgun_rate,
          ROUND(AVG(CASE WHEN posteam = '${safeTeam}' THEN COALESCE(no_huddle, 0) * 100.0 END), 1) AS no_huddle_rate,
          ROUND(AVG(CASE WHEN posteam = '${safeTeam}' AND yardline_100 <= 20 AND play_type = 'pass' THEN 100.0 WHEN posteam = '${safeTeam}' AND yardline_100 <= 20 THEN 0.0 END), 1) AS rz_pass_rate,
          ROUND(AVG(CASE WHEN play_type = 'pass' THEN 100.0 ELSE 0.0 END), 1) AS lg_pass_rate,
          ROUND(AVG(CASE WHEN down IN (1,2) AND play_type = 'pass' THEN 100.0 WHEN down IN (1,2) THEN 0.0 END), 1) AS lg_early_pass_rate,
          ROUND(AVG(COALESCE(shotgun, 0) * 100.0), 1) AS lg_shotgun_rate
        FROM nfl_pbp
        WHERE season = ${s} AND play_type IN ('pass', 'run') AND posteam IS NOT NULL
      `),
      vaultApi.query(`
        WITH categorized AS (
          SELECT posteam,
                 play_type,
                 CASE
                   WHEN down = 1 THEN '1st Down'
                   WHEN down = 2 AND ydstogo <= 3 THEN '2nd & Short'
                   WHEN down = 2 AND ydstogo <= 7 THEN '2nd & Med'
                   WHEN down = 2 THEN '2nd & Long'
                   WHEN down = 3 AND ydstogo <= 3 THEN '3rd & Short'
                   WHEN down = 3 AND ydstogo <= 7 THEN '3rd & Med'
                   WHEN down = 3 THEN '3rd & Long'
                   ELSE '4th Down'
                 END AS situation,
                 CASE
                   WHEN down = 1 THEN 1
                   WHEN down = 2 AND ydstogo <= 3 THEN 2
                   WHEN down = 2 AND ydstogo <= 7 THEN 3
                   WHEN down = 2 THEN 4
                   WHEN down = 3 AND ydstogo <= 3 THEN 5
                   WHEN down = 3 AND ydstogo <= 7 THEN 6
                   WHEN down = 3 THEN 7
                   ELSE 8
                 END AS sort_order
          FROM nfl_pbp
          WHERE season = ${s} AND play_type IN ('pass', 'run') AND down IN (1,2,3,4)
        )
        SELECT situation,
               sort_order,
               ROUND(AVG(CASE WHEN posteam = '${safeTeam}' AND play_type = 'pass' THEN 100.0 WHEN posteam = '${safeTeam}' THEN 0.0 END), 1) AS team_pass_pct,
               ROUND(AVG(CASE WHEN play_type = 'pass' THEN 100.0 ELSE 0.0 END), 1) AS league_pass_pct,
               SUM(CASE WHEN posteam = '${safeTeam}' THEN 1 ELSE 0 END) AS team_plays
        FROM categorized
        GROUP BY situation, sort_order
        ORDER BY sort_order
      `),
      vaultApi.query(`
        SELECT pass_length,
               pass_location,
               COUNT(*) AS targets,
               ROUND(AVG(epa), 3) AS epa_per_play,
               ROUND(AVG(COALESCE(complete_pass, 0)) * 100.0, 1) AS comp_pct
        FROM nfl_pbp
        WHERE season = ${s}
          AND posteam = '${safeTeam}'
          AND pass_attempt = 1
          AND pass_length IN ('short', 'deep')
          AND pass_location IN ('left', 'middle', 'right')
        GROUP BY pass_length, pass_location
      `),
      vaultApi.query(`
        WITH gaps AS (
          SELECT
            CASE
              WHEN run_location = 'left' AND run_gap = 'end' THEN 'Left End'
              WHEN run_location = 'left' AND run_gap = 'tackle' THEN 'Left Tackle'
              WHEN run_location = 'left' AND run_gap = 'guard' THEN 'Left Guard'
              WHEN run_location = 'middle' THEN 'Middle'
              WHEN run_location = 'right' AND run_gap = 'guard' THEN 'Right Guard'
              WHEN run_location = 'right' AND run_gap = 'tackle' THEN 'Right Tackle'
              WHEN run_location = 'right' AND run_gap = 'end' THEN 'Right End'
              ELSE NULL
            END AS gap_label,
            CASE
              WHEN run_location = 'left' AND run_gap = 'end' THEN 1
              WHEN run_location = 'left' AND run_gap = 'tackle' THEN 2
              WHEN run_location = 'left' AND run_gap = 'guard' THEN 3
              WHEN run_location = 'middle' THEN 4
              WHEN run_location = 'right' AND run_gap = 'guard' THEN 5
              WHEN run_location = 'right' AND run_gap = 'tackle' THEN 6
              WHEN run_location = 'right' AND run_gap = 'end' THEN 7
              ELSE 99
            END AS sort_order,
            yards_gained,
            epa
          FROM nfl_pbp
          WHERE season = ${s} AND posteam = '${safeTeam}' AND rush_attempt = 1
        )
        SELECT gap_label,
               sort_order,
               COUNT(*) AS carries,
               ROUND(AVG(yards_gained), 2) AS ypc,
               ROUND(AVG(epa), 3) AS epa_per_rush
        FROM gaps
        WHERE gap_label IS NOT NULL
        GROUP BY gap_label, sort_order
        ORDER BY sort_order
      `),
    ])
      .then(([kpiRes, sitRes, passRes, runRes]) => {
        setKpi((kpiRes.rows[0] as unknown as SummaryKpi) ?? null);
        setSituations(sitRes.rows as unknown as SituationRow[]);
        setPassZones(passRes.rows as unknown as PassZoneRow[]);
        setRunGaps(runRes.rows as unknown as RunGapRow[]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [season, team]);

  const situationChartData = useMemo(
    () => ({
      labels: situations.map((s) => `${s.situation} (${s.team_plays})`),
      datasets: [
        {
          label: `${team} Pass %`,
          data: situations.map((s) => s.team_pass_pct),
          backgroundColor: '#38bdf8',
          borderRadius: 4,
        },
        {
          label: 'League Avg Pass %',
          data: situations.map((s) => s.league_pass_pct),
          backgroundColor: 'rgba(148, 163, 184, 0.45)',
          borderRadius: 4,
        },
      ],
    }),
    [situations, team]
  );

  const runGapChartData = useMemo(
    () => ({
      labels: runGaps.map((g) => g.gap_label),
      datasets: [
        {
          label: 'Carries',
          data: runGaps.map((g) => g.carries),
          backgroundColor: runGaps.map((g) =>
            g.epa_per_rush >= 0 ? 'rgba(52, 211, 153, 0.8)' : 'rgba(248, 113, 113, 0.8)'
          ),
          borderRadius: 4,
        },
      ],
    }),
    [runGaps]
  );

  const totalPassTargets = useMemo(
    () => passZones.reduce((acc, z) => acc + z.targets, 0),
    [passZones]
  );

  const getPassZone = (len: string, loc: string) =>
    passZones.find((z) => z.pass_length === len && z.pass_location === loc);

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center gap-2.5">
          <Compass className="h-5 w-5 text-sky-400" />
          <div>
            <h2 className="text-lg font-bold text-slate-100">Offensive Tendencies Lab</h2>
            <p className="text-xs text-slate-400">
              Situational play-calling, formation rates, pass target zones, and run-gap distributions vs. league average.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="mr-2 text-xs font-medium text-slate-400">Team</label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
            >
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mr-2 text-xs font-medium text-slate-400">Season</label>
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
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center text-xs text-slate-400">
          Analyzing {team} {season} play-by-play tendencies...
        </div>
      )}

      {/* KPI Strip */}
      {kpi && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Overall Pass Rate</div>
            <div className="mt-1 tabular-nums text-2xl font-extrabold text-sky-400">
              {kpi.pass_rate}%
            </div>
            <div className="text-[11px] text-slate-500">League avg: {kpi.lg_pass_rate}%</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Early-Down Pass %</div>
            <div className="mt-1 tabular-nums text-2xl font-extrabold text-emerald-400">
              {kpi.early_pass_rate}%
            </div>
            <div className="text-[11px] text-slate-500">League avg: {kpi.lg_early_pass_rate}%</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Shotgun Rate</div>
            <div className="mt-1 tabular-nums text-2xl font-extrabold text-amber-400">
              {kpi.shotgun_rate}%
            </div>
            <div className="text-[11px] text-slate-500">League avg: {kpi.lg_shotgun_rate}%</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">No-Huddle Tempo</div>
            <div className="mt-1 tabular-nums text-2xl font-extrabold text-purple-400">
              {kpi.no_huddle_rate}%
            </div>
            <div className="text-[11px] text-slate-500">of all scrimmage plays</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
            <div className="text-xs text-slate-400">Red Zone Pass %</div>
            <div className="mt-1 tabular-nums text-2xl font-extrabold text-rose-400">
              {kpi.rz_pass_rate}%
            </div>
            <div className="text-[11px] text-slate-500">Inside opp 20-yd line</div>
          </div>
        </div>
      )}

      {/* Down & Distance Chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-200">
          Pass Rate by Down &amp; Distance ({team} vs. League Avg — {season})
        </h3>
        <p className="mb-3 text-xs text-slate-400">
          Numbers in parentheses show {team} play count in each situation.
        </p>
        <div className="h-72 w-full">
          <Bar
            data={situationChartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  min: 0,
                  max: 100,
                  ticks: { callback: (v) => `${v}%` },
                },
              },
            }}
          />
        </div>
      </div>

      {/* Pass Target Heatmap + Run Gap Chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Pass Target Zones (Depth × Direction)
          </h3>
          <p className="mb-3 text-xs text-slate-400">
            Target share %, completion %, and EPA/play across 6 field zones.
          </p>
          <div className="space-y-3">
            {(['deep', 'short'] as const).map((len) => (
              <div key={len}>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {len === 'deep' ? 'Deep (15+ Air Yards)' : 'Short (<15 Air Yards)'}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['left', 'middle', 'right'] as const).map((loc) => {
                    const z = getPassZone(len, loc);
                    const share =
                      z && totalPassTargets > 0
                        ? ((z.targets / totalPassTargets) * 100).toFixed(1)
                        : '0.0';
                    const epa = z?.epa_per_play ?? 0;
                    const bgClass = !z
                      ? 'border-slate-800 bg-slate-950'
                      : epa >= 0.25
                        ? 'border-emerald-700/70 bg-emerald-950/60'
                        : epa >= 0
                          ? 'border-sky-800/70 bg-sky-950/50'
                          : 'border-rose-800/70 bg-rose-950/50';
                    return (
                      <div key={loc} className={`rounded-lg border p-3 ${bgClass}`}>
                        <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-300">
                          <span>{loc}</span>
                          <span className="tabular-nums text-slate-400">{share}%</span>
                        </div>
                        <div className="mt-1 tabular-nums text-lg font-bold text-white">
                          {z ? `${z.epa_per_play >= 0 ? '+' : ''}${z.epa_per_play}` : '—'}{' '}
                          <span className="text-[11px] font-normal text-slate-400">EPA</span>
                        </div>
                        <div className="text-[11px] tabular-nums text-slate-400">
                          {z ? `${z.targets} tgt • ${z.comp_pct}% comp` : 'No data'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Run Gap Tendencies (Green = Positive EPA, Red = Negative EPA)
          </h3>
          <p className="mb-3 text-xs text-slate-400">
            Carry volume and efficiency across offensive line gaps.
          </p>
          <div className="h-52 w-full">
            <Bar
              data={runGapChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
              }}
            />
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] tabular-nums">
            {runGaps.map((g) => (
              <div key={g.gap_label} className="rounded bg-slate-950 p-1.5">
                <div className="truncate font-semibold text-slate-300">{g.gap_label}</div>
                <div className="text-sky-400">{g.ypc} ypc</div>
                <div className={g.epa_per_rush >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {g.epa_per_rush >= 0 ? '+' : ''}
                  {g.epa_per_rush}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
