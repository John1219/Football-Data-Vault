"""Fantasy data ingestion from Sleeper public API."""

import json
from datetime import datetime, timedelta, timezone

import httpx

from vault.config import settings
from vault.db import get_pg_conn, log_ingestion_run

SLEEPER_BASE = "https://api.sleeper.app/v1"


def _players_recently_synced() -> bool:
    """Respect Sleeper's guideline to fetch /players/nfl at most once per day."""
    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT synced_at FROM nfl.ingestion_runs
                WHERE source = 'sleeper' AND dataset = 'players' AND status = 'success'
                ORDER BY synced_at DESC LIMIT 1
                """
            )
            row = cur.fetchone()
    if not row:
        return False
    return row["synced_at"] > datetime.now(timezone.utc) - timedelta(hours=24)


def sync_sleeper(force_players: bool = False) -> dict[str, int]:
    """Sync Sleeper NFL players (max 1x/day unless forced) and configured leagues."""
    results: dict[str, int] = {}

    with httpx.Client(base_url=SLEEPER_BASE, timeout=60.0) as client:
        if force_players or not _players_recently_synced():
            resp = client.get("/players/nfl")
            resp.raise_for_status()
            players: dict[str, dict] = resp.json()

            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    for pid, pdata in players.items():
                        cur.execute(
                            """
                            INSERT INTO fantasy.sleeper_players
                                (player_id, full_name, first_name, last_name, position, team, status, age, years_exp, raw_json, updated_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
                            ON CONFLICT (player_id) DO UPDATE SET
                                full_name = EXCLUDED.full_name,
                                position = EXCLUDED.position,
                                team = EXCLUDED.team,
                                status = EXCLUDED.status,
                                age = EXCLUDED.age,
                                years_exp = EXCLUDED.years_exp,
                                raw_json = EXCLUDED.raw_json,
                                updated_at = NOW()
                            """,
                            (
                                pid,
                                pdata.get("full_name"),
                                pdata.get("first_name"),
                                pdata.get("last_name"),
                                pdata.get("position"),
                                pdata.get("team"),
                                pdata.get("status"),
                                pdata.get("age"),
                                pdata.get("years_exp"),
                                json.dumps(pdata),
                            ),
                        )
                conn.commit()
            log_ingestion_run("sleeper", "players", None, len(players))
            results["players"] = len(players)
        else:
            results["players_skipped_cached"] = 1

        league_ids = set(settings.parsed_sleeper_leagues())
        if settings.sleeper_username:
            u_resp = client.get(f"/user/{settings.sleeper_username}")
            if u_resp.status_code == 200 and u_resp.json():
                user_id = u_resp.json()["user_id"]
                for season in settings.parsed_nfl_seasons():
                    l_resp = client.get(f"/user/{user_id}/leagues/nfl/{season}")
                    if l_resp.status_code == 200:
                        for lg in l_resp.json() or []:
                            league_ids.add(lg["league_id"])

        synced_leagues = 0
        for lid in sorted(league_ids):
            resp = client.get(f"/league/{lid}")
            if resp.status_code != 200 or not resp.json():
                continue
            lg = resp.json()
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO fantasy.sleeper_leagues
                            (league_id, name, season, sport, status, total_rosters, raw_json, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
                        ON CONFLICT (league_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            status = EXCLUDED.status,
                            total_rosters = EXCLUDED.total_rosters,
                            raw_json = EXCLUDED.raw_json,
                            updated_at = NOW()
                        """,
                        (
                            lg["league_id"],
                            lg.get("name"),
                            lg.get("season"),
                            lg.get("sport"),
                            lg.get("status"),
                            lg.get("total_rosters"),
                            json.dumps(lg),
                        ),
                    )
                conn.commit()
            synced_leagues += 1
        if synced_leagues:
            log_ingestion_run("sleeper", "leagues", None, synced_leagues)
        results["leagues"] = synced_leagues

    return results
