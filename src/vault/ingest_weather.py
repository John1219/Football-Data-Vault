"""Game-day weather enrichment using Open-Meteo Historical Weather API (CC-BY 4.0)."""

from datetime import datetime

import httpx
import polars as pl

from vault.config import settings
from vault.db import get_duckdb_conn, log_ingestion_run

OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

# Approximate lat/lon for NFL stadiums keyed by home_team abbreviation
NFL_STADIUM_COORDS: dict[str, tuple[float, float]] = {
    "ARI": (33.5276, -112.2626),
    "ATL": (33.7554, -84.4008),
    "BAL": (39.2780, -76.6227),
    "BUF": (42.7738, -78.7870),
    "CAR": (35.2258, -80.8528),
    "CHI": (41.8623, -87.6167),
    "CIN": (39.0955, -84.5161),
    "CLE": (41.5061, -81.6995),
    "DAL": (32.7473, -97.0945),
    "DEN": (39.7439, -105.0201),
    "DET": (42.3400, -83.0456),
    "GB": (44.5013, -88.0622),
    "HOU": (29.6847, -95.4107),
    "IND": (39.7601, -86.1639),
    "JAX": (30.3239, -81.6373),
    "KC": (39.0489, -94.4839),
    "LA": (33.9535, -118.3392),
    "LAC": (33.9535, -118.3392),
    "LAR": (33.9535, -118.3392),
    "LV": (36.0909, -115.1833),
    "MIA": (25.9580, -80.2389),
    "MIN": (44.9736, -93.2575),
    "NE": (42.0909, -71.2643),
    "NO": (29.9511, -90.0812),
    "NYG": (40.8128, -74.0742),
    "NYJ": (40.8128, -74.0742),
    "PHI": (39.9008, -75.1675),
    "PIT": (40.4468, -80.0158),
    "SEA": (47.5952, -122.3316),
    "SF": (37.4033, -121.9694),
    "TB": (27.9759, -82.5033),
    "TEN": (36.1665, -86.7713),
    "WAS": (38.9076, -76.8645),
}


def _parse_kickoff_hour(gameday: str | None, gametime: str | None) -> int:
    """Extract local/ET kickoff hour (0-23) from gametime string like '13:00'."""
    if not gametime:
        return 13
    try:
        return int(str(gametime).split(":")[0])
    except ValueError:
        return 13


def sync_nfl_weather(seasons: list[int] | None = None) -> dict[str, int]:
    """Fetch kickoff weather for NFL games in nfl_schedules via Open-Meteo Archive."""
    settings.ensure_directories()
    target_seasons = seasons or settings.parsed_nfl_seasons()
    results: dict[str, int] = {}
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    with httpx.Client(timeout=30.0) as client:
        for season in target_seasons:
            sched_path = settings.parquet_root / "nfl" / "schedules" / f"{season}.parquet"
            if not sched_path.is_file():
                results[f"weather:{season}"] = 0
                continue

            sched = pl.read_parquet(sched_path)
            records: list[dict] = []

            for row in sched.select(
                ["game_id", "season", "week", "gameday", "gametime", "home_team", "roof", "surface"]
            ).iter_rows(named=True):
                gameday = str(row["gameday"] or "")
                if not gameday or gameday >= today_str:
                    continue
                coords = NFL_STADIUM_COORDS.get(row["home_team"])
                if not coords:
                    continue

                lat, lon = coords
                hour_idx = _parse_kickoff_hour(gameday, row["gametime"])
                resp = client.get(
                    OPEN_METEO_ARCHIVE_URL,
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "start_date": gameday,
                        "end_date": gameday,
                        "hourly": "temperature_2m,precipitation,wind_speed_10m,weather_code",
                        "temperature_unit": "fahrenheit",
                        "wind_speed_unit": "mph",
                        "timezone": "America/New_York",
                    },
                )
                if resp.status_code != 200:
                    continue
                hourly = resp.json().get("hourly", {})
                temps = hourly.get("temperature_2m", [])
                precips = hourly.get("precipitation", [])
                winds = hourly.get("wind_speed_10m", [])
                codes = hourly.get("weather_code", [])
                if hour_idx >= len(temps):
                    continue

                records.append(
                    {
                        "game_id": row["game_id"],
                        "season": row["season"],
                        "week": row["week"],
                        "gameday": gameday,
                        "home_team": row["home_team"],
                        "roof": row["roof"],
                        "surface": row["surface"],
                        "temp_f": temps[hour_idx],
                        "wind_mph": winds[hour_idx] if hour_idx < len(winds) else None,
                        "precip_mm": precips[hour_idx] if hour_idx < len(precips) else None,
                        "weather_code": codes[hour_idx] if hour_idx < len(codes) else None,
                    }
                )

            out_path = settings.parquet_root / "nfl" / "weather" / f"{season}.parquet"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            if records:
                pl.DataFrame(records).write_parquet(out_path, compression="zstd")
            log_ingestion_run("open-meteo", "weather", season, len(records), str(out_path))
            results[f"weather:{season}"] = len(records)

    weather_glob = str(settings.parquet_root / "nfl" / "weather" / "*.parquet").replace("\\", "/")
    with get_duckdb_conn() as con:
        if list((settings.parquet_root / "nfl" / "weather").glob("*.parquet")):
            con.execute(
                f"CREATE OR REPLACE VIEW nfl_weather AS SELECT * FROM read_parquet('{weather_glob}', union_by_name=true)"
            )

    return results
