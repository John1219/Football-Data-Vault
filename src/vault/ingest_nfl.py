"""NFL data ingestion using nflreadpy (nflverse) -> Parquet + DuckDB views."""

from pathlib import Path
from typing import Callable

import nflreadpy as nfl
import polars as pl

from vault.config import settings
from vault.db import get_duckdb_conn, log_ingestion_run

SEASONAL_DATASETS: dict[str, Callable[[list[int]], pl.DataFrame]] = {
    "schedules": nfl.load_schedules,
    "rosters": nfl.load_rosters,
    "player_stats": nfl.load_player_stats,
    "pbp": nfl.load_pbp,
    "injuries": nfl.load_injuries,
}

GLOBAL_DATASETS: dict[str, Callable[[], pl.DataFrame]] = {
    "contracts": nfl.load_contracts,
    "draft_picks": nfl.load_draft_picks,
    "combine": nfl.load_combine,
}


def _write_parquet(df: pl.DataFrame, target: Path) -> int:
    """Write a Polars DataFrame to Parquet and return row count."""
    target.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(target, compression="zstd")
    return df.height


def register_duckdb_views() -> list[str]:
    """Create or replace DuckDB views over all stored NFL Parquet datasets."""
    nfl_root = settings.parquet_root / "nfl"
    registered: list[str] = []
    with get_duckdb_conn() as con:
        for dataset_dir in sorted(nfl_root.iterdir()):
            if not dataset_dir.is_dir():
                continue
            parquet_files = list(dataset_dir.glob("*.parquet"))
            if not parquet_files:
                continue
            glob_path = str(dataset_dir / "*.parquet").replace("\\", "/")
            view_name = f"nfl_{dataset_dir.name}"
            con.execute(
                f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{glob_path}', union_by_name=true)"
            )
            registered.append(view_name)
    return registered


def sync_nfl(
    seasons: list[int] | None = None,
    datasets: list[str] | None = None,
) -> dict[str, int]:
    """Sync configured NFL datasets to Parquet and register DuckDB views."""
    settings.ensure_directories()
    target_seasons = seasons or settings.parsed_nfl_seasons()
    selected = set(datasets) if datasets else (set(SEASONAL_DATASETS) | set(GLOBAL_DATASETS))
    results: dict[str, int] = {}

    for name, loader in SEASONAL_DATASETS.items():
        if name not in selected:
            continue
        for season in target_seasons:
            out_path = settings.parquet_root / "nfl" / name / f"{season}.parquet"
            try:
                df = loader([season])
                rows = _write_parquet(df, out_path)
                log_ingestion_run("nflverse", name, season, rows, str(out_path))
                results[f"{name}:{season}"] = rows
            except Exception as exc:
                log_ingestion_run(
                    "nflverse", name, season, 0, str(out_path), status="error", error_message=str(exc)
                )
                results[f"{name}:{season}"] = -1

    for name, loader in GLOBAL_DATASETS.items():
        if name not in selected:
            continue
        out_path = settings.parquet_root / "nfl" / name / "all.parquet"
        try:
            df = loader()
            rows = _write_parquet(df, out_path)
            log_ingestion_run("nflverse", name, None, rows, str(out_path))
            results[name] = rows
        except Exception as exc:
            log_ingestion_run(
                "nflverse", name, None, 0, str(out_path), status="error", error_message=str(exc)
            )
            results[name] = -1

    register_duckdb_views()
    return results
