import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  ChevronLeft,
  ChevronRight,
  FastForward,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { vaultApi } from '../api';

interface GameOption {
  game_id: string;
  season: number;
  week: number;
  gameday: string;
  away_team: string;
  home_team: string;
  away_score: number | null;
  home_score: number | null;
  stadium: string | null;
  roof: string | null;
  temp: number | null;
  wind: number | null;
}

interface PbpPlay {
  play_id: number;
  drive: number | null;
  qtr: number | null;
  time: string | null;
  down: number | null;
  ydstogo: number | null;
  yardline_100: number | null;
  posteam: string | null;
  defteam: string | null;
  home_team: string;
  away_team: string;
  posteam_score: number | null;
  defteam_score: number | null;
  total_home_score: number | null;
  total_away_score: number | null;
  play_type: string | null;
  desc: string | null;
  yards_gained: number | null;
  shotgun: number | null;
  no_huddle: number | null;
  pass_length: string | null;
  pass_location: string | null;
  air_yards: number | null;
  yards_after_catch: number | null;
  run_location: string | null;
  run_gap: string | null;
  passer_player_name: string | null;
  receiver_player_name: string | null;
  rusher_player_name: string | null;
  epa: number | null;
  wp: number | null;
  home_wp: number | null;
  wpa: number | null;
  touchdown: number | null;
  interception: number | null;
  fumble_lost: number | null;
  sack: number | null;
  complete_pass: number | null;
  field_goal_result: string | null;
}

const TEAM_COLORS: Record<string, string> = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D',
  CAR: '#0085CA', CHI: '#0B162A', CIN: '#FB4F14', CLE: '#311D00',
  DAL: '#003594', DEN: '#FB4F14', DET: '#0076B6', GB: '#203731',
  HOU: '#03202F', IND: '#002C5F', JAX: '#006778', KC: '#E31837',
  LA: '#003594', LAC: '#0080C6', LV: '#111111', MIA: '#008E97',
  MIN: '#4F2683', NE: '#002244', NO: '#D3BC8D', NYG: '#0B2265',
  NYJ: '#125740', PHI: '#004C54', PIT: '#FFB612', SEA: '#002244',
  SF: '#AA0000', TB: '#D50A0A', TEN: '#0C2340', WAS: '#5A1414',
};

function laneY(location: string | null, gap?: string | null): number {
  const loc = (location ?? 'middle').toLowerCase();
  if (loc === 'left') {
    if (gap === 'end') return 10;
    if (gap === 'tackle') return 16;
    if (gap === 'guard') return 21;
    return 13;
  }
  if (loc === 'right') {
    if (gap === 'end') return 43;
    if (gap === 'tackle') return 37;
    if (gap === 'guard') return 32;
    return 40;
  }
  return 26.65;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export default function PlayRecreator() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number>(2026);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [games, setGames] = useState<GameOption[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [plays, setPlays] = useState<PbpPlay[]>([]);
  const [playIdx, setPlayIdx] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Animation state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [speed, setSpeed] = useState<number>(1);
  const [progress, setProgress] = useState<number>(1);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Load available seasons from nfl_schedules
  useEffect(() => {
    vaultApi
      .query('SELECT DISTINCT season FROM nfl_schedules ORDER BY season DESC')
      .then((res) => {
        const list = res.rows.map((r) => Number(r.season)).filter((n) => !Number.isNaN(n));
        setSeasons(list);
        if (list.length > 0) {
          setSelectedSeason(list[0]);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Load weeks for selected season
  useEffect(() => {
    if (!selectedSeason) return;
    vaultApi
      .query(
        `SELECT DISTINCT week FROM nfl_schedules WHERE season = ${Number(selectedSeason)} ORDER BY week`
      )
      .then((res) => {
        const list = res.rows.map((r) => Number(r.week)).filter((n) => !Number.isNaN(n));
        setWeeks(list);
        if (list.length > 0) {
          setSelectedWeek(list[0]);
        }
      })
      .catch((e) => setError(e.message));
  }, [selectedSeason]);

  // Load games for selected season + week
  useEffect(() => {
    if (!selectedSeason || !selectedWeek) return;
    vaultApi
      .query(
        `SELECT game_id, season, week, gameday, away_team, home_team, away_score, home_score, stadium, roof, temp, wind
         FROM nfl_schedules
         WHERE season = ${Number(selectedSeason)} AND week = ${Number(selectedWeek)}
         ORDER BY gameday, game_id`
      )
      .then((res) => {
        const rows = res.rows as unknown as GameOption[];
        setGames(rows);
        if (rows.length > 0) {
          setSelectedGameId(rows[0].game_id);
        } else {
          setSelectedGameId('');
          setPlays([]);
        }
      })
      .catch((e) => setError(e.message));
  }, [selectedSeason, selectedWeek]);

  // Load PBP plays for selected game
  useEffect(() => {
    if (!selectedGameId) return;
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    const safeId = selectedGameId.replace(/'/g, "''");
    vaultApi
      .query(
        `SELECT play_id, drive, qtr, time, down, ydstogo, yardline_100,
                posteam, defteam, home_team, away_team,
                posteam_score, defteam_score, total_home_score, total_away_score,
                play_type, "desc", yards_gained, shotgun, no_huddle,
                pass_length, pass_location, air_yards, yards_after_catch,
                run_location, run_gap,
                passer_player_name, receiver_player_name, rusher_player_name,
                epa, wp, home_wp, wpa, touchdown, interception, fumble_lost, sack,
                complete_pass, field_goal_result
         FROM nfl_pbp
         WHERE game_id = '${safeId}' AND play_type IS NOT NULL
         ORDER BY play_id`
      )
      .then((res) => {
        const rows = res.rows as unknown as PbpPlay[];
        setPlays(rows);
        setPlayIdx(0);
        setProgress(1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedGameId]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
      return;
    }

    const durationMs = 1800 / speed;

    const tick = (now: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = now;
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      setProgress((prev) => {
        const next = prev + dt / durationMs;
        if (next >= 1) {
          if (autoAdvance && playIdx < plays.length - 1) {
            setPlayIdx((i) => Math.min(plays.length - 1, i + 1));
            return 0;
          }
          setIsPlaying(false);
          return 1;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, speed, autoAdvance, playIdx, plays.length]);

  const currentPlay = plays[playIdx] ?? null;
  const selectedGame = games.find((g) => g.game_id === selectedGameId) ?? null;

  const triggerPlay = (idx: number) => {
    setPlayIdx(clamp(idx, 0, Math.max(0, plays.length - 1)));
    setProgress(0);
    setIsPlaying(true);
  };

  // Compute field geometry for currentPlay
  const fieldGeom = useMemo(() => {
    if (!currentPlay) return null;
    const yardline100 = currentPlay.yardline_100 ?? 50;
    const losX = 10 + (100 - yardline100);
    const ydstogo = currentPlay.ydstogo ?? 10;
    const firstDownX = clamp(losX + ydstogo, 10, 110);
    const yardsGained = currentPlay.yards_gained ?? 0;
    const endX = clamp(losX + yardsGained, 2, 118);
    const qbX = currentPlay.shotgun === 1 ? losX - 5 : losX - 2;
    const rbX = currentPlay.shotgun === 1 ? losX - 5.5 : losX - 6;
    const midY = 26.65;

    const pType = (currentPlay.play_type ?? '').toLowerCase();
    const isPass = pType === 'pass';
    const isRun = pType === 'run';
    const isKick = pType === 'punt' || pType === 'kickoff' || pType === 'field_goal';

    const airYards = currentPlay.air_yards ?? (isPass ? yardsGained : 0);
    const targetX = clamp(losX + airYards, 2, 118);
    const targetY = isPass
      ? laneY(currentPlay.pass_location)
      : isRun
        ? laneY(currentPlay.run_location, currentPlay.run_gap)
        : midY;

    return {
      losX,
      firstDownX,
      endX,
      qbX,
      rbX,
      midY,
      pType,
      isPass,
      isRun,
      isKick,
      targetX,
      targetY,
      offColor: TEAM_COLORS[currentPlay.posteam ?? ''] ?? '#38bdf8',
      defColor: TEAM_COLORS[currentPlay.defteam ?? ''] ?? '#ef4444',
    };
  }, [currentPlay]);

  // Animated ball & active player coordinates
  const animCoords = useMemo(() => {
    if (!fieldGeom || !currentPlay) return null;
    const { losX, qbX, rbX, midY, endX, targetX, targetY, isPass, isRun, isKick } = fieldGeom;
    const t = clamp(progress, 0, 1);

    let ballX = losX;
    let ballY = midY;
    let ballArcLift = 0;
    let runnerX = qbX;
    let runnerY = midY;

    if (isPass) {
      if (currentPlay.sack === 1) {
        const dropT = Math.min(1, t / 0.5);
        runnerX = qbX - dropT * 3;
        runnerY = midY;
        ballX = runnerX;
        ballY = runnerY;
      } else if (t < 0.25) {
        const p = t / 0.25;
        runnerX = qbX - p * 2.5;
        runnerY = midY;
        ballX = runnerX;
        ballY = runnerY;
      } else if (t < 0.65) {
        const p = (t - 0.25) / 0.4;
        const startX = qbX - 2.5;
        ballX = startX + (targetX - startX) * p;
        ballY = midY + (targetY - midY) * p;
        ballArcLift = Math.sin(p * Math.PI) * 5;
        runnerX = targetX;
        runnerY = targetY;
      } else {
        const p = (t - 0.65) / 0.35;
        const caught = currentPlay.complete_pass === 1 || (currentPlay.yards_gained ?? 0) > 0;
        if (caught && currentPlay.interception !== 1) {
          ballX = targetX + (endX - targetX) * p;
          ballY = targetY + (midY - targetY) * 0.25 * p;
        } else {
          ballX = targetX;
          ballY = targetY;
        }
        runnerX = ballX;
        runnerY = ballY;
      }
    } else if (isRun) {
      if (t < 0.22) {
        const p = t / 0.22;
        runnerX = rbX + (losX - 2 - rbX) * p;
        runnerY = midY + (targetY - midY) * 0.3 * p;
        ballX = runnerX;
        ballY = runnerY;
      } else {
        const p = (t - 0.22) / 0.78;
        const startX = losX - 2;
        const startY = midY + (targetY - midY) * 0.3;
        runnerX = startX + (endX - startX) * p;
        runnerY = startY + (targetY - startY) * Math.min(1, p * 1.4);
        ballX = runnerX;
        ballY = runnerY;
      }
    } else if (isKick) {
      ballX = losX + (endX - losX) * t;
      ballY = midY;
      ballArcLift = Math.sin(t * Math.PI) * 8;
      runnerX = losX - 2;
      runnerY = midY;
    }

    return { ballX, ballY, ballArcLift, runnerX, runnerY };
  }, [fieldGeom, currentPlay, progress]);

  // Win Probability Chart Data
  const wpChartData = useMemo(() => {
    const labels = plays.map((p, idx) => `Q${p.qtr ?? '?'} #${idx + 1}`);
    const homeWp = plays.map((p) => (p.home_wp !== null ? +(p.home_wp * 100).toFixed(1) : null));
    return {
      labels,
      datasets: [
        {
          label: `${selectedGame?.home_team ?? 'Home'} Win Prob (%)`,
          data: homeWp,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          fill: true,
          tension: 0.25,
          pointRadius: plays.map((_, i) => (i === playIdx ? 6 : 1.5)),
          pointBackgroundColor: plays.map((_, i) => (i === playIdx ? '#f59e0b' : '#38bdf8')),
          pointBorderWidth: 0,
        },
      ],
    };
  }, [plays, playIdx, selectedGame]);

  const wpChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event: unknown, elements: { index: number }[]) => {
        if (elements.length > 0) {
          triggerPlay(elements[0].index);
        }
      },
      plugins: {
        legend: { display: true, labels: { color: '#cbd5e1', boxWidth: 12 } },
      },
      scales: {
        x: { display: false },
        y: {
          min: 0,
          max: 100,
          ticks: { color: '#94a3b8', callback: (v: string | number) => `${v}%` },
          grid: { color: 'rgba(51, 65, 85, 0.4)' },
        },
      },
    }),
    [plays.length]
  );

  return (
    <div className="space-y-4">
      {/* Top Game Selector Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Season</label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Week</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {weeks.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[260px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400">Game</label>
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {games.map((g) => (
                <option key={g.game_id} value={g.game_id}>
                  {g.away_team} ({g.away_score ?? '-'}) @ {g.home_team} ({g.home_score ?? '-'}) — {g.gameday}
                </option>
              ))}
            </select>
          </div>
          {selectedGame && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              {selectedGame.stadium && (
                <span className="rounded-md bg-slate-800 px-2.5 py-1.5">{selectedGame.stadium}</span>
              )}
              {selectedGame.roof && (
                <span className="rounded-md bg-slate-800 px-2.5 py-1.5">{selectedGame.roof}</span>
              )}
              {selectedGame.temp !== null && (
                <span className="rounded-md bg-slate-800 px-2.5 py-1.5">
                  {selectedGame.temp}°F / {selectedGame.wind ?? 0} mph
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 8 cols: Scoreboard + 2D Field + Controls + WP Chart */}
        <div className="space-y-4 lg:col-span-8">
          {/* Scoreboard & Play Telemetry */}
          {currentPlay && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: TEAM_COLORS[currentPlay.away_team] ?? '#64748b' }}
                    />
                    <span className="font-bold">{currentPlay.away_team}</span>
                    <span className="tabular-nums text-xl font-extrabold text-white">
                      {currentPlay.total_away_score ?? 0}
                    </span>
                  </div>
                  <span className="text-slate-600">@</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: TEAM_COLORS[currentPlay.home_team] ?? '#64748b' }}
                    />
                    <span className="font-bold">{currentPlay.home_team}</span>
                    <span className="tabular-nums text-xl font-extrabold text-white">
                      {currentPlay.total_home_score ?? 0}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded bg-slate-800 px-2.5 py-1 text-sky-300">
                    Q{currentPlay.qtr ?? '-'} • {currentPlay.time ?? '--:--'}
                  </span>
                  <span className="rounded bg-slate-800 px-2.5 py-1 text-amber-300">
                    {currentPlay.down ? `${currentPlay.down}&${currentPlay.ydstogo}` : currentPlay.play_type?.toUpperCase()}
                  </span>
                  <span className="rounded bg-slate-800 px-2.5 py-1 text-slate-200">
                    POS: {currentPlay.posteam ?? '—'}
                  </span>
                  <span
                    className={`rounded px-2.5 py-1 tabular-nums ${
                      (currentPlay.epa ?? 0) >= 0
                        ? 'bg-emerald-950 text-emerald-300'
                        : 'bg-rose-950 text-rose-300'
                    }`}
                  >
                    EPA: {currentPlay.epa !== null ? currentPlay.epa.toFixed(2) : '—'}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-200">{currentPlay.desc}</p>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                {currentPlay.passer_player_name && <span>Passer: <strong className="text-slate-200">{currentPlay.passer_player_name}</strong></span>}
                {currentPlay.receiver_player_name && <span>Target: <strong className="text-slate-200">{currentPlay.receiver_player_name}</strong></span>}
                {currentPlay.rusher_player_name && <span>Rusher: <strong className="text-slate-200">{currentPlay.rusher_player_name}</strong></span>}
                {currentPlay.yards_gained !== null && <span>Gain: <strong className="text-slate-200">{currentPlay.yards_gained} yds</strong></span>}
                {currentPlay.air_yards !== null && <span>Air: <strong className="text-slate-200">{currentPlay.air_yards} yds</strong></span>}
                {currentPlay.yards_after_catch !== null && <span>YAC: <strong className="text-slate-200">{currentPlay.yards_after_catch} yds</strong></span>}
              </div>
            </div>
          )}

          {/* 2D SVG Football Field */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-3">
            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                Loading play-by-play telemetry...
              </div>
            ) : !fieldGeom || !animCoords || !currentPlay ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                Select a game to recreate plays.
              </div>
            ) : (
              <svg viewBox="0 0 120 53.3" className="h-auto w-full rounded-lg shadow-inner">
                {/* Turf background */}
                <rect x="0" y="0" width="120" height="53.3" fill="#14532d" />
                {/* Alternating 5-yard turf stripes */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <rect
                    key={i}
                    x={10 + i * 5}
                    y={0}
                    width={5}
                    height={53.3}
                    fill={i % 2 === 0 ? '#166534' : '#15803d'}
                    opacity={0.45}
                  />
                ))}

                {/* Left Endzone (Offense's own) */}
                <rect
                  x="0"
                  y="0"
                  width="10"
                  height="53.3"
                  fill={fieldGeom.offColor}
                  opacity={0.8}
                />
                <text
                  x="5"
                  y="26.65"
                  fill="#ffffff"
                  fontSize="4.5"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform="rotate(-90 5 26.65)"
                  opacity={0.85}
                >
                  {currentPlay.posteam ?? 'OFF'}
                </text>

                {/* Right Endzone (Defense's endzone) */}
                <rect
                  x="110"
                  y="0"
                  width="10"
                  height="53.3"
                  fill={fieldGeom.defColor}
                  opacity={0.8}
                />
                <text
                  x="115"
                  y="26.65"
                  fill="#ffffff"
                  fontSize="4.5"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform="rotate(90 115 26.65)"
                  opacity={0.85}
                >
                  {currentPlay.defteam ?? 'DEF'}
                </text>

                {/* Yard lines every 5 yards */}
                {Array.from({ length: 21 }).map((_, i) => {
                  const x = 10 + i * 5;
                  const yardNum = i * 5 <= 50 ? i * 5 : 100 - i * 5;
                  return (
                    <g key={x}>
                      <line
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={53.3}
                        stroke="#e2e8f0"
                        strokeWidth={i === 0 || i === 20 ? 0.45 : 0.18}
                        opacity={0.7}
                      />
                      {i > 0 && i < 20 && i % 2 === 0 && (
                        <>
                          <text
                            x={x}
                            y={7}
                            fill="#f8fafc"
                            fontSize="2.8"
                            fontWeight="bold"
                            textAnchor="middle"
                            opacity={0.75}
                          >
                            {yardNum}
                          </text>
                          <text
                            x={x}
                            y={48.5}
                            fill="#f8fafc"
                            fontSize="2.8"
                            fontWeight="bold"
                            textAnchor="middle"
                            opacity={0.75}
                          >
                            {yardNum}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}

                {/* Hash marks */}
                {Array.from({ length: 99 }).map((_, i) => {
                  const x = 11 + i;
                  return (
                    <g key={x} stroke="#e2e8f0" strokeWidth={0.14} opacity={0.55}>
                      <line x1={x} y1={20} x2={x} y2={20.8} />
                      <line x1={x} y1={32.5} x2={x} y2={33.3} />
                    </g>
                  );
                })}

                {/* Line of Scrimmage (Blue) */}
                <line
                  x1={fieldGeom.losX}
                  y1={0}
                  x2={fieldGeom.losX}
                  y2={53.3}
                  stroke="#38bdf8"
                  strokeWidth={0.55}
                />

                {/* First Down Marker (Yellow) */}
                <line
                  x1={fieldGeom.firstDownX}
                  y1={0}
                  x2={fieldGeom.firstDownX}
                  y2={53.3}
                  stroke="#facc15"
                  strokeWidth={0.55}
                  strokeDasharray="1.5 1"
                />

                {/* Play Trajectory Path */}
                {fieldGeom.isPass && (
                  <>
                    <path
                      d={`M ${fieldGeom.qbX - 2} ${fieldGeom.midY} Q ${(fieldGeom.qbX + fieldGeom.targetX) / 2} ${(fieldGeom.midY + fieldGeom.targetY) / 2 - 5} ${fieldGeom.targetX} ${fieldGeom.targetY}`}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={0.45}
                      strokeDasharray="1.2 0.8"
                      opacity={0.85}
                    />
                    {currentPlay.complete_pass === 1 && fieldGeom.endX !== fieldGeom.targetX && (
                      <line
                        x1={fieldGeom.targetX}
                        y1={fieldGeom.targetY}
                        x2={fieldGeom.endX}
                        y2={fieldGeom.midY + (fieldGeom.targetY - fieldGeom.midY) * 0.75}
                        stroke="#34d399"
                        strokeWidth={0.55}
                      />
                    )}
                  </>
                )}

                {fieldGeom.isRun && (
                  <line
                    x1={fieldGeom.losX - 2}
                    y1={fieldGeom.midY}
                    x2={fieldGeom.endX}
                    y2={fieldGeom.targetY}
                    stroke="#34d399"
                    strokeWidth={0.6}
                    strokeLinecap="round"
                  />
                )}

                {/* Offensive Line (5 dots) */}
                {[-4, -2, 0, 2, 4].map((dy) => (
                  <circle
                    key={`ol-${dy}`}
                    cx={fieldGeom.losX - 0.8}
                    cy={fieldGeom.midY + dy}
                    r={0.85}
                    fill={fieldGeom.offColor}
                    stroke="#ffffff"
                    strokeWidth={0.22}
                  />
                ))}

                {/* Offensive Skill Positions */}
                <circle cx={fieldGeom.losX - 1.2} cy={9} r={0.85} fill={fieldGeom.offColor} stroke="#fff" strokeWidth={0.22} />
                <circle cx={fieldGeom.losX - 1.2} cy={44} r={0.85} fill={fieldGeom.offColor} stroke="#fff" strokeWidth={0.22} />
                <circle cx={fieldGeom.losX - 1.5} cy={17} r={0.85} fill={fieldGeom.offColor} stroke="#fff" strokeWidth={0.22} />

                {/* Defense (DL + LB + DB) */}
                {[-3.5, -1.2, 1.2, 3.5].map((dy) => (
                  <circle
                    key={`dl-${dy}`}
                    cx={fieldGeom.losX + 1.1}
                    cy={fieldGeom.midY + dy}
                    r={0.85}
                    fill={fieldGeom.defColor}
                    stroke="#0f172a"
                    strokeWidth={0.22}
                  />
                ))}
                {[-6, 0, 6].map((dy) => (
                  <circle
                    key={`lb-${dy}`}
                    cx={fieldGeom.losX + 4.5}
                    cy={fieldGeom.midY + dy}
                    r={0.85}
                    fill={fieldGeom.defColor}
                    stroke="#0f172a"
                    strokeWidth={0.22}
                  />
                ))}
                {[9, 44].map((y) => (
                  <circle
                    key={`cb-${y}`}
                    cx={fieldGeom.losX + 6}
                    cy={y}
                    r={0.85}
                    fill={fieldGeom.defColor}
                    stroke="#0f172a"
                    strokeWidth={0.22}
                  />
                ))}
                {[18, 35].map((y) => (
                  <circle
                    key={`s-${y}`}
                    cx={fieldGeom.losX + 12}
                    cy={y}
                    r={0.85}
                    fill={fieldGeom.defColor}
                    stroke="#0f172a"
                    strokeWidth={0.22}
                  />
                ))}

                {/* Animated Ball Carrier / Target */}
                <circle
                  cx={animCoords.runnerX}
                  cy={animCoords.runnerY}
                  r={1.15}
                  fill="#fbbf24"
                  stroke="#ffffff"
                  strokeWidth={0.3}
                />

                {/* Animated Football */}
                <ellipse
                  cx={animCoords.ballX}
                  cy={animCoords.ballY - animCoords.ballArcLift * 0.35}
                  rx={0.95 + animCoords.ballArcLift * 0.05}
                  ry={0.58 + animCoords.ballArcLift * 0.03}
                  fill="#92400e"
                  stroke="#fef3c7"
                  strokeWidth={0.2}
                />

                {/* Event Outcome Badge */}
                {progress > 0.85 && currentPlay.touchdown === 1 && (
                  <g>
                    <rect x="46" y="21" width="28" height="10" rx="2" fill="#059669" opacity="0.95" />
                    <text x="60" y="27.5" fill="#fff" fontSize="4.2" fontWeight="bold" textAnchor="middle">
                      TOUCHDOWN!
                    </text>
                  </g>
                )}
                {progress > 0.85 && currentPlay.interception === 1 && (
                  <g>
                    <rect x="44" y="21" width="32" height="10" rx="2" fill="#dc2626" opacity="0.95" />
                    <text x="60" y="27.5" fill="#fff" fontSize="4.2" fontWeight="bold" textAnchor="middle">
                      INTERCEPTION!
                    </text>
                  </g>
                )}
                {progress > 0.85 && currentPlay.sack === 1 && (
                  <g>
                    <rect x="49" y="21" width="22" height="10" rx="2" fill="#e11d48" opacity="0.95" />
                    <text x="60" y="27.5" fill="#fff" fontSize="4.2" fontWeight="bold" textAnchor="middle">
                      SACK!
                    </text>
                  </g>
                )}
              </svg>
            )}

            {/* Playback Controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => triggerPlay(0)}
                  disabled={plays.length === 0}
                  className="rounded-lg bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  title="First Play"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  onClick={() => triggerPlay(playIdx - 1)}
                  disabled={playIdx <= 0}
                  className="rounded-lg bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  title="Previous Play"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (progress >= 1) setProgress(0);
                    setIsPlaying((p) => !p);
                  }}
                  disabled={plays.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-40"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  onClick={() => triggerPlay(playIdx)}
                  disabled={plays.length === 0}
                  className="rounded-lg bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  title="Replay Current Play"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => triggerPlay(playIdx + 1)}
                  disabled={playIdx >= plays.length - 1}
                  className="rounded-lg bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  title="Next Play"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => triggerPlay(plays.length - 1)}
                  disabled={plays.length === 0}
                  className="rounded-lg bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  title="Last Play"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-300">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={autoAdvance}
                    onChange={(e) => setAutoAdvance(e.target.checked)}
                    className="accent-sky-500"
                  />
                  Auto-Advance
                </label>
                <div className="flex items-center gap-1">
                  <FastForward className="h-3.5 w-3.5 text-slate-400" />
                  {[0.5, 1, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`rounded px-2 py-1 ${
                        speed === s ? 'bg-sky-500 font-semibold text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <span className="tabular-nums text-slate-400">
                  Play {plays.length > 0 ? playIdx + 1 : 0} / {plays.length}
                </span>
              </div>
            </div>
          </div>

          {/* Win Probability Chart */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                Game Win Probability Timeline (click any point to jump to play)
              </h3>
            </div>
            <div className="h-44 w-full">
              <Line data={wpChartData} options={wpChartOptions} />
            </div>
          </div>
        </div>

        {/* Right 4 cols: Play-by-Play Feed */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 lg:col-span-4">
          <h3 className="mb-2 px-1 text-sm font-semibold text-slate-200">
            Play-by-Play Log ({plays.length})
          </h3>
          <div className="max-h-[680px] space-y-1.5 overflow-y-auto pr-1">
            {plays.map((p, idx) => {
              const active = idx === playIdx;
              return (
                <button
                  key={p.play_id}
                  onClick={() => triggerPlay(idx)}
                  className={`w-full rounded-lg border p-2.5 text-left transition ${
                    active
                      ? 'border-sky-500 bg-sky-950/50'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-slate-400">
                      Q{p.qtr ?? '-'} {p.time ?? ''} • {p.posteam ?? '—'}
                      {p.down ? ` • ${p.down}&${p.ydstogo}` : ''}
                    </span>
                    <span
                      className={`tabular-nums ${
                        (p.epa ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {p.epa !== null ? `${p.epa >= 0 ? '+' : ''}${p.epa.toFixed(2)} EPA` : ''}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-slate-200">{p.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
