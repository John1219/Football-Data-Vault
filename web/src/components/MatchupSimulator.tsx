import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Dices, RefreshCw } from 'lucide-react';
import { vaultApi } from '../api';

interface TeamProfile {
  team: string;
  games: number;
  off_pass_epa: number;
  off_run_epa: number;
  def_pass_epa: number;
  def_run_epa: number;
  pass_rate: number;
  explosive_rate: number;
  turnover_rate: number;
  ppg: number;
  papg: number;
}

interface SimDrive {
  driveNum: number;
  team: string;
  outcome: 'TD' | 'FG' | 'Punt' | 'Turnover';
  points: number;
  yards: number;
}

interface SimSummary {
  sims: number;
  awayWins: number;
  homeWins: number;
  ties: number;
  avgAwayScore: number;
  avgHomeScore: number;
  impliedSpread: number; // negative = home favored
  impliedTotal: number;
  marginBuckets: { label: string; count: number; isHomeWin: boolean }[];
  sampleDrives: SimDrive[];
  sampleAwayScore: number;
  sampleHomeScore: number;
}

function randNormal(mean: number, std: number): number {
  const u1 = Math.max(1e-9, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * std;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export default function MatchupSimulator() {
  const [teams, setTeams] = useState<string[]>([]);
  const [awayTeam, setAwayTeam] = useState<string>('BAL');
  const [homeTeam, setHomeTeam] = useState<string>('KC');
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [windowMode, setWindowMode] = useState<'1' | '2' | '3' | '5' | '10'>('2');
  const [numSims, setNumSims] = useState<number>(2500);
  const [hfaPoints, setHfaPoints] = useState<number>(2.0);
  const [awayPassShift, setAwayPassShift] = useState<number>(0);
  const [homePassShift, setHomePassShift] = useState<number>(0);

  const [profiles, setProfiles] = useState<Record<string, TeamProfile>>({});
  const [simResult, setSimResult] = useState<SimSummary | null>(null);
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
        setAvailableSeasons(sList);
        const tList = tRes.rows.map((r) => String(r.team));
        setTeams(tList);
        if (tList.length >= 2) {
          if (!tList.includes(awayTeam)) setAwayTeam(tList[0]);
          if (!tList.includes(homeTeam)) setHomeTeam(tList[1]);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const targetSeasons = useMemo(() => {
    const count = Number(windowMode);
    return availableSeasons.slice(0, count);
  }, [availableSeasons, windowMode]);

  useEffect(() => {
    if (targetSeasons.length === 0) return;
    setLoading(true);
    setError(null);
    const seasonList = targetSeasons.join(',');

    vaultApi
      .query(`
        WITH off AS (
          SELECT posteam AS team,
                 ROUND(AVG(CASE WHEN play_type = 'pass' THEN epa END), 4) AS off_pass_epa,
                 ROUND(AVG(CASE WHEN play_type = 'run' THEN epa END), 4) AS off_run_epa,
                 ROUND(AVG(CASE WHEN play_type = 'pass' THEN 1.0 ELSE 0.0 END), 4) AS pass_rate,
                 ROUND(AVG(CASE WHEN (play_type = 'pass' AND yards_gained >= 20) OR (play_type = 'run' AND yards_gained >= 10) THEN 1.0 ELSE 0.0 END), 4) AS explosive_rate,
                 ROUND(AVG(CASE WHEN interception = 1 OR fumble_lost = 1 THEN 1.0 ELSE 0.0 END), 4) AS turnover_rate
          FROM nfl_pbp
          WHERE season IN (${seasonList}) AND play_type IN ('pass', 'run') AND posteam IS NOT NULL AND epa IS NOT NULL
          GROUP BY posteam
        ),
        def AS (
          SELECT defteam AS team,
                 ROUND(AVG(CASE WHEN play_type = 'pass' THEN epa END), 4) AS def_pass_epa,
                 ROUND(AVG(CASE WHEN play_type = 'run' THEN epa END), 4) AS def_run_epa
          FROM nfl_pbp
          WHERE season IN (${seasonList}) AND play_type IN ('pass', 'run') AND defteam IS NOT NULL AND epa IS NOT NULL
          GROUP BY defteam
        ),
        sched AS (
          SELECT team, COUNT(*) AS games, ROUND(AVG(pts_for), 2) AS ppg, ROUND(AVG(pts_against), 2) AS papg
          FROM (
            SELECT home_team AS team, home_score AS pts_for, away_score AS pts_against
            FROM nfl_schedules WHERE season IN (${seasonList}) AND home_score IS NOT NULL
            UNION ALL
            SELECT away_team AS team, away_score AS pts_for, home_score AS pts_against
            FROM nfl_schedules WHERE season IN (${seasonList}) AND away_score IS NOT NULL
          ) t
          GROUP BY team
        )
        SELECT off.team, sched.games, off.off_pass_epa, off.off_run_epa,
               def.def_pass_epa, def.def_run_epa,
               off.pass_rate, off.explosive_rate, off.turnover_rate,
               sched.ppg, sched.papg
        FROM off
        JOIN def ON off.team = def.team
        JOIN sched ON off.team = sched.team
        ORDER BY off.team
      `)
      .then((res) => {
        const map: Record<string, TeamProfile> = {};
        for (const r of res.rows) {
          const p = r as unknown as TeamProfile;
          map[p.team] = p;
        }
        setProfiles(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [targetSeasons]);

  const runSimulation = () => {
    const away = profiles[awayTeam];
    const home = profiles[homeTeam];
    if (!away || !home) return;

    const awayPass = clamp(away.pass_rate + awayPassShift / 100, 0.25, 0.85);
    const homePass = clamp(home.pass_rate + homePassShift / 100, 0.25, 0.85);

    // Matchup EPA per play combining offense + opposing defense
    const awayMatchupEpa =
      awayPass * ((away.off_pass_epa + home.def_pass_epa) / 2) +
      (1 - awayPass) * ((away.off_run_epa + home.def_run_epa) / 2);
    const homeMatchupEpa =
      homePass * ((home.off_pass_epa + away.def_pass_epa) / 2) +
      (1 - homePass) * ((home.off_run_epa + away.def_run_epa) / 2);

    // Expected points per drive (~11 drives per team): baseline ~2.05 pts/drive + EPA adjustment
    const awayDriveExpected = clamp(2.05 + awayMatchupEpa * 5.2 + (away.ppg - home.papg) * 0.02, 0.8, 3.6);
    const homeDriveExpected = clamp(
      2.05 + homeMatchupEpa * 5.2 + (home.ppg - away.papg) * 0.02 + hfaPoints / 11,
      0.8,
      3.8
    );

    const bucketMap = new Map<number, number>();
    for (let b = -35; b <= 35; b += 5) bucketMap.set(b, 0);

    let awayWins = 0;
    let homeWins = 0;
    let ties = 0;
    let totalAway = 0;
    let totalHome = 0;
    let sampleDrives: SimDrive[] = [];
    let sampleAwayScore = 0;
    let sampleHomeScore = 0;

    const simDrive = (teamName: string, expectedPts: number, toRate: number, driveNum: number): SimDrive => {
      const turnProb = clamp(toRate * 5.5, 0.05, 0.22);
      const tdProb = clamp((expectedPts - 0.55) / 6.3, 0.1, 0.45);
      const fgProb = clamp(0.18 + expectedPts * 0.03, 0.12, 0.28);

      const roll = Math.random();
      if (roll < turnProb) {
        return { driveNum, team: teamName, outcome: 'Turnover', points: 0, yards: Math.round(randNormal(18, 12)) };
      }
      if (roll < turnProb + tdProb) {
        return { driveNum, team: teamName, outcome: 'TD', points: 7, yards: Math.round(clamp(randNormal(72, 14), 25, 99)) };
      }
      if (roll < turnProb + tdProb + fgProb) {
        return { driveNum, team: teamName, outcome: 'FG', points: 3, yards: Math.round(clamp(randNormal(48, 12), 15, 75)) };
      }
      return { driveNum, team: teamName, outcome: 'Punt', points: 0, yards: Math.round(clamp(randNormal(14, 10), -5, 42)) };
    };

    for (let i = 0; i < numSims; i++) {
      let aScore = 0;
      let hScore = 0;
      const drivesThisGame: SimDrive[] = [];

      for (let d = 1; d <= 11; d++) {
        const aDrive = simDrive(awayTeam, awayDriveExpected, away.turnover_rate, d);
        const hDrive = simDrive(homeTeam, homeDriveExpected, home.turnover_rate, d);
        aScore += aDrive.points;
        hScore += hDrive.points;
        if (i === 0) {
          drivesThisGame.push(aDrive, hDrive);
        }
      }

      if (i === 0) {
        sampleDrives = drivesThisGame;
        sampleAwayScore = aScore;
        sampleHomeScore = hScore;
      }

      totalAway += aScore;
      totalHome += hScore;
      if (aScore > hScore) awayWins++;
      else if (hScore > aScore) homeWins++;
      else ties++;

      const margin = hScore - aScore; // positive = home win
      const bucket = clamp(Math.round(margin / 5) * 5, -35, 35);
      bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
    }

    const avgAwayScore = totalAway / numSims;
    const avgHomeScore = totalHome / numSims;

    const marginBuckets = Array.from(bucketMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([b, count]) => ({
        label: b === 0 ? 'Tie (0)' : b > 0 ? `${homeTeam} +${b}` : `${awayTeam} +${Math.abs(b)}`,
        count,
        isHomeWin: b >= 0,
      }));

    setSimResult({
      sims: numSims,
      awayWins,
      homeWins,
      ties,
      avgAwayScore,
      avgHomeScore,
      impliedSpread: avgAwayScore - avgHomeScore,
      impliedTotal: avgAwayScore + avgHomeScore,
      marginBuckets,
      sampleDrives,
      sampleAwayScore,
      sampleHomeScore,
    });
  };

  useEffect(() => {
    if (profiles[awayTeam] && profiles[homeTeam]) {
      runSimulation();
    }
  }, [profiles, awayTeam, homeTeam, numSims, hfaPoints, awayPassShift, homePassShift]);

  const marginChartData = useMemo(() => {
    if (!simResult) return null;
    return {
      labels: simResult.marginBuckets.map((b) => b.label),
      datasets: [
        {
          label: 'Simulated Games',
          data: simResult.marginBuckets.map((b) => b.count),
          backgroundColor: simResult.marginBuckets.map((b) =>
            b.isHomeWin ? 'rgba(56, 189, 248, 0.8)' : 'rgba(244, 114, 182, 0.8)'
          ),
          borderRadius: 4,
        },
      ],
    };
  }, [simResult]);

  const awayProf = profiles[awayTeam];
  const homeProf = profiles[homeTeam];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Dices className="h-5 w-5 text-sky-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Historical Monte Carlo Matchup Simulator
              </h2>
              <p className="text-xs text-slate-400">
                Uses historical DuckDB play-by-play EPA, pass/run splits, turnover rates, and scoring baselines to simulate future matchups.
              </p>
            </div>
          </div>
          <button
            onClick={runSimulation}
            disabled={loading || !awayProf || !homeProf}
            className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-Run {numSims.toLocaleString()} Sims
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Away Team</label>
            <select
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
            >
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Home Team</label>
            <select
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
            >
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Historical Baseline</label>
            <select
              value={windowMode}
              onChange={(e) => setWindowMode(e.target.value as '1' | '2' | '3' | '5' | '10')}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
            >
              <option value="1">Latest Season ({availableSeasons[0] ?? ''})</option>
              <option value="2">Last 2 Seasons</option>
              <option value="3">Last 3 Seasons</option>
              <option value="5">Last 5 Seasons</option>
              <option value="10">Last 10 Seasons</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Simulations</label>
            <select
              value={numSims}
              onChange={(e) => setNumSims(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
            >
              <option value={1000}>1,000 games</option>
              <option value={2500}>2,500 games</option>
              <option value={5000}>5,000 games</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Home Field Adv</label>
            <select
              value={hfaPoints}
              onChange={(e) => setHfaPoints(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
            >
              <option value={0}>Neutral Site (0 pts)</option>
              <option value={1.5}>Standard (+1.5 pts)</option>
              <option value={2.5}>Strong (+2.5 pts)</option>
            </select>
          </div>
        </div>

        {/* Tactical What-If Sliders */}
        <div className="mt-3 grid grid-cols-1 gap-4 border-t border-slate-800 pt-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">
              {awayTeam} Pass Rate Shift:{' '}
              <strong className="text-pink-400">
                {awayPassShift >= 0 ? `+${awayPassShift}%` : `${awayPassShift}%`}
              </strong>
            </span>
            <input
              type="range"
              min={-15}
              max={15}
              step={1}
              value={awayPassShift}
              onChange={(e) => setAwayPassShift(Number(e.target.value))}
              className="w-44 accent-pink-400"
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-400">
              {homeTeam} Pass Rate Shift:{' '}
              <strong className="text-sky-400">
                {homePassShift >= 0 ? `+${homePassShift}%` : `${homePassShift}%`}
              </strong>
            </span>
            <input
              type="range"
              min={-15}
              max={15}
              step={1}
              value={homePassShift}
              onChange={(e) => setHomePassShift(Number(e.target.value))}
              className="w-44 accent-sky-400"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Simulation Outcome Banner */}
      {simResult && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs text-slate-400">{awayTeam} Win Probability</div>
              <div className="mt-1 tabular-nums text-3xl font-extrabold text-pink-400">
                {((simResult.awayWins / simResult.sims) * 100).toFixed(1)}%
              </div>
              <div className="text-xs tabular-nums text-slate-400">
                Proj Score: <strong className="text-slate-200">{simResult.avgAwayScore.toFixed(1)}</strong>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs text-slate-400">{homeTeam} Win Probability</div>
              <div className="mt-1 tabular-nums text-3xl font-extrabold text-sky-400">
                {((simResult.homeWins / simResult.sims) * 100).toFixed(1)}%
              </div>
              <div className="text-xs tabular-nums text-slate-400">
                Proj Score: <strong className="text-slate-200">{simResult.avgHomeScore.toFixed(1)}</strong>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs text-slate-400">Implied Vegas Line</div>
              <div className="mt-1 tabular-nums text-2xl font-extrabold text-amber-400">
                {simResult.impliedSpread <= 0
                  ? `${homeTeam} ${simResult.impliedSpread.toFixed(1)}`
                  : `${awayTeam} -${simResult.impliedSpread.toFixed(1)}`}
              </div>
              <div className="text-xs tabular-nums text-slate-400">
                Ties: {((simResult.ties / simResult.sims) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-xs text-slate-400">Projected Total (O/U)</div>
              <div className="mt-1 tabular-nums text-3xl font-extrabold text-emerald-400">
                {simResult.impliedTotal.toFixed(1)}
              </div>
              <div className="text-xs text-slate-400">
                Baseline: {targetSeasons.join(', ')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Margin Histogram */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 lg:col-span-7">
              <h3 className="mb-1 text-sm font-semibold text-slate-200">
                Simulated Score Margin Distribution ({simResult.sims.toLocaleString()} Games)
              </h3>
              <p className="mb-3 text-xs text-slate-400">
                Pink = {awayTeam} win margins • Blue = {homeTeam} win margins
              </p>
              <div className="h-64 w-full">
                {marginChartData && (
                  <Bar
                    data={marginChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                    }}
                  />
                )}
              </div>
            </div>

            {/* Historical Baseline Comparison */}
            {awayProf && homeProf && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 lg:col-span-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-200">
                  Historical Baseline Profile ({targetSeasons.join(', ')})
                </h3>
                <table className="w-full text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-1.5">Metric</th>
                      <th className="py-1.5 text-pink-400">{awayTeam}</th>
                      <th className="py-1.5 text-sky-400">{homeTeam}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr>
                      <td className="py-2 text-slate-300">Off Pass EPA/Play</td>
                      <td className="py-2 font-semibold">{awayProf.off_pass_epa}</td>
                      <td className="py-2 font-semibold">{homeProf.off_pass_epa}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-300">Off Run EPA/Play</td>
                      <td className="py-2 font-semibold">{awayProf.off_run_epa}</td>
                      <td className="py-2 font-semibold">{homeProf.off_run_epa}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-300">Def Pass EPA Allowed</td>
                      <td className="py-2 font-semibold">{awayProf.def_pass_epa}</td>
                      <td className="py-2 font-semibold">{homeProf.def_pass_epa}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-300">Def Run EPA Allowed</td>
                      <td className="py-2 font-semibold">{awayProf.def_run_epa}</td>
                      <td className="py-2 font-semibold">{homeProf.def_run_epa}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-300">Pass Rate</td>
                      <td className="py-2 font-semibold">{(awayProf.pass_rate * 100).toFixed(1)}%</td>
                      <td className="py-2 font-semibold">{(homeProf.pass_rate * 100).toFixed(1)}%</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-slate-300">PPG / PAPG</td>
                      <td className="py-2 font-semibold">
                        {awayProf.ppg} / {awayProf.papg}
                      </td>
                      <td className="py-2 font-semibold">
                        {homeProf.ppg} / {homeProf.papg}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sample Simulated Game Drive Log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                Sample Simulated Game Drive-by-Drive Box ({awayTeam} {simResult.sampleAwayScore} — {homeTeam} {simResult.sampleHomeScore})
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {simResult.sampleDrives.map((d, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-2 text-xs ${
                    d.outcome === 'TD'
                      ? 'border-emerald-700/70 bg-emerald-950/40'
                      : d.outcome === 'FG'
                        ? 'border-sky-700/70 bg-sky-950/40'
                        : d.outcome === 'Turnover'
                          ? 'border-rose-700/70 bg-rose-950/40'
                          : 'border-slate-800 bg-slate-950'
                  }`}
                >
                  <div className="flex justify-between font-semibold">
                    <span className={d.team === awayTeam ? 'text-pink-400' : 'text-sky-400'}>
                      #{d.driveNum} {d.team}
                    </span>
                    <span>{d.outcome}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                    {d.yards} yds • +{d.points} pts
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
