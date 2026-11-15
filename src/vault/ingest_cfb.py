"""College Football Data (CFBD) ingestion -> PostgreSQL + Parquet + DuckDB."""

import httpx
import polars as pl

from vault.config import settings
from vault.db import get_duckdb_conn, get_pg_conn, log_ingestion_run

CFBD_BASE_URL = "https://api.collegefootballdata.com"


def sync_cfb(seasons: list[int] | None = None) -> dict[str, int]:
    """Fetch FBS teams and games from CFBD REST API into PostgreSQL and Parquet."""
    if not settings.cfbd_api_key:
        raise ValueError("CFBD_API_KEY is not set. Add it to .env to sync College Football data.")

    settings.ensure_directories()
    target_seasons = seasons or settings.parsed_cfb_seasons()
    headers = {"Authorization": f"Bearer {settings.cfbd_api_key}", "Accept": "application/json"}
    results: dict[str, int] = {}

    with httpx.Client(base_url=CFBD_BASE_URL, headers=headers, timeout=60.0) as client:
        teams_resp = client.get("/teams/fbs")
        teams_resp.raise_for_status()
        team_dicts: list[dict] = teams_resp.json()

        if team_dicts:
            with get_pg_conn() as conn:
                with conn.cursor() as cur:
                    for t in team_dicts:
                        cur.execute(
                            """
                            INSERT INTO cfb.teams
                                (id, school, mascot, abbreviation, conference, division, classification, color, alt_color, updated_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                            ON CONFLICT (id) DO UPDATE SET
                                school = EXCLUDED.school,
                                mascot = EXCLUDED.mascot,
                                abbreviation = EXCLUDED.abbreviation,
                                conference = EXCLUDED.conference,
                                division = EXCLUDED.division,
                                classification = EXCLUDED.classification,
                                color = EXCLUDED.color,
                                alt_color = EXCLUDED.alt_color,
                                updated_at = NOW()
                            """,
                            (
                                t.get("id"),
                                t.get("school"),
                                t.get("mascot"),
                                t.get("abbreviation"),
                                t.get("conference"),
                                t.get("division"),
                                t.get("classification"),
                                t.get("color"),
                                t.get("alternateColor") or t.get("alt_color"),
                            ),
                        )
                conn.commit()
            teams_path = settings.parquet_root / "cfb" / "teams" / "fbs.parquet"
            teams_path.parent.mkdir(parents=True, exist_ok=True)
            pl.DataFrame(team_dicts, infer_schema_length=None).write_parquet(
                teams_path, compression="zstd"
            )
            log_ingestion_run("cfbd", "teams", None, len(team_dicts), str(teams_path))
        results["teams"] = len(team_dicts)

        for season in target_seasons:
            games_resp = client.get("/games", params={"year": season})
            games_resp.raise_for_status()
            game_dicts: list[dict] = games_resp.json()

            if game_dicts:
                with get_pg_conn() as conn:
                    with conn.cursor() as cur:
                        for g in game_dicts:
                            cur.execute(
                                """
                                INSERT INTO cfb.games
                                    (id, season, week, season_type, start_date, completed, home_team, home_points, away_team, away_points, venue, updated_at)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                                ON CONFLICT (id) DO UPDATE SET
                                    completed = EXCLUDED.completed,
                                    home_points = EXCLUDED.home_points,
                                    away_points = EXCLUDED.away_points,
                                    updated_at = NOW()
                                """,
                                (
                                    g.get("id"),
                                    g.get("season"),
                                    g.get("week"),
                                    g.get("seasonType") or g.get("season_type") or "regular",
                                    g.get("startDate") or g.get("start_date"),
                                    g.get("completed"),
                                    g.get("homeTeam") or g.get("home_team"),
                                    g.get("homePoints") if "homePoints" in g else g.get("home_points"),
                                    g.get("awayTeam") or g.get("away_team"),
                                    g.get("awayPoints") if "awayPoints" in g else g.get("away_points"),
                                    g.get("venue"),
                                ),
                            )
                    conn.commit()
                games_path = settings.parquet_root / "cfb" / "games" / f"{season}.parquet"
                games_path.parent.mkdir(parents=True, exist_ok=True)
                pl.DataFrame(game_dicts, infer_schema_length=None).write_parquet(
                    games_path, compression="zstd"
                )
                log_ingestion_run("cfbd", "games", season, len(game_dicts), str(games_path))
            results[f"games:{season}"] = len(game_dicts)

    cfb_games_glob = str(settings.parquet_root / "cfb" / "games" / "*.parquet").replace("\\", "/")
    with get_duckdb_conn() as con:
        if list((settings.parquet_root / "cfb" / "games").glob("*.parquet")):
            con.execute(
                f"CREATE OR REPLACE VIEW cfb_games AS SELECT * FROM read_parquet('{cfb_games_glob}', union_by_name=true)"
            )

    return results
