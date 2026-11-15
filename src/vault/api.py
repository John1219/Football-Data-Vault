"""FastAPI service for the Ultimate Football Data Vault."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from vault.config import settings
from vault.db import get_duckdb_conn, get_pg_conn
from vault.ingest_cfb import sync_cfb
from vault.ingest_nfl import sync_nfl
from vault.ingest_sleeper import sync_sleeper
from vault.ingest_weather import sync_nfl_weather
from vault.media_manager import register_media_asset, scan_local_media
from vault.ui import DASHBOARD_HTML

logger = logging.getLogger("vault.scheduler")
ALLOWED_SQL_PREFIXES = ("SELECT", "WITH", "SHOW", "DESCRIBE", "EXPLAIN")


async def _auto_sync_loop() -> None:
    """Periodically run NFL, Sleeper, and CFB syncs when AUTO_SYNC_ENABLED=true."""
    interval_seconds = max(1, settings.auto_sync_interval_hours) * 3600
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await asyncio.to_thread(sync_nfl)
            await asyncio.to_thread(sync_sleeper)
            if settings.cfbd_api_key:
                await asyncio.to_thread(sync_cfb)
            logger.info("Scheduled vault sync completed.")
        except Exception:
            logger.exception("Scheduled vault sync failed.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Manage optional background auto-sync task."""
    task: asyncio.Task | None = None
    if settings.auto_sync_enabled:
        task = asyncio.create_task(_auto_sync_loop())
    try:
        yield
    finally:
        if task:
            task.cancel()


app = FastAPI(title="Ultimate Football Data Vault", version="0.2.0", lifespan=lifespan)


class MediaRegisterRequest(BaseModel):
    """Request payload for registering a local media file or external link."""

    title: str
    media_type: str
    is_local_file: bool = True
    relative_path: str | None = None
    source_url: str | None = None
    source_name: str | None = None
    license_name: str | None = None
    league: str | None = None
    season: int | None = None
    game_id: str | None = None
    team_abbr: str | None = None
    player_id: str | None = None
    tags: list[str] = []
    description: str | None = None


class QueryRequest(BaseModel):
    """Read-only SQL query payload for DuckDB."""

    sql: str


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    """Serve the single-page Football Data Vault dashboard."""
    return DASHBOARD_HTML


@app.get("/health")
def health() -> dict[str, Any]:
    """Verify PostgreSQL, DuckDB, and local storage directories."""
    settings.ensure_directories()
    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            pg_ok = cur.fetchone()["ok"] == 1
    with get_duckdb_conn() as con:
        duck_ok = con.execute("SELECT 1").fetchone()[0] == 1
    return {"status": "ok", "postgres": pg_ok, "duckdb": duck_ok}


@app.get("/views")
def list_duckdb_views() -> dict[str, list[str]]:
    """List registered DuckDB views backed by Parquet files."""
    with get_duckdb_conn() as con:
        rows = con.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_type = 'VIEW' ORDER BY table_name"
        ).fetchall()
    return {"views": [r[0] for r in rows]}


@app.post("/query")
def run_duckdb_query(payload: QueryRequest) -> dict[str, Any]:
    """Execute a read-only SQL query against DuckDB."""
    sql = payload.sql.strip()
    if not sql or not sql.upper().startswith(ALLOWED_SQL_PREFIXES):
        raise HTTPException(
            status_code=400,
            detail="Only read-only queries (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN) are allowed.",
        )
    try:
        with get_duckdb_conn() as con:
            rel = con.execute(sql)
            cols = [desc[0] for desc in rel.description] if rel.description else []
            rows = [dict(zip(cols, row)) for row in rel.fetchmany(500)]
        return {"columns": cols, "rows": rows}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/runs")
def list_ingestion_runs(limit: int = Query(default=25, le=200)) -> list[dict[str, Any]]:
    """Return recent ingestion runs from PostgreSQL."""
    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM nfl.ingestion_runs ORDER BY synced_at DESC LIMIT %s", (limit,))
            return [dict(r) for r in cur.fetchall()]


@app.post("/sync/nfl")
def trigger_nfl_sync(seasons: list[int] | None = None, datasets: list[str] | None = None) -> dict[str, int]:
    """Trigger NFL dataset sync via nflreadpy."""
    return sync_nfl(seasons=seasons, datasets=datasets)


@app.post("/sync/cfb")
def trigger_cfb_sync(seasons: list[int] | None = None) -> dict[str, int]:
    """Trigger College Football sync via CFBD API."""
    try:
        return sync_cfb(seasons=seasons)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/sync/sleeper")
def trigger_sleeper_sync(force_players: bool = False) -> dict[str, int]:
    """Trigger Sleeper fantasy sync."""
    return sync_sleeper(force_players=force_players)


@app.post("/sync/weather")
def trigger_weather_sync(seasons: list[int] | None = None) -> dict[str, int]:
    """Trigger NFL game-day weather enrichment via Open-Meteo."""
    return sync_nfl_weather(seasons=seasons)


@app.post("/media/scan")
def trigger_media_scan() -> dict[str, int]:
    """Scan local media directories and register untracked files."""
    return {"registered": scan_local_media()}


@app.post("/media/register")
def register_media(payload: MediaRegisterRequest) -> dict[str, Any]:
    """Register a local media file or external link-only URL."""
    try:
        return register_media_asset(**payload.model_dump())
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/media/file/{asset_id}")
def serve_media_file(asset_id: int) -> FileResponse:
    """Safely serve a locally archived media file by asset ID."""
    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT is_local_file, relative_path FROM media.assets WHERE id = %s",
                (asset_id,),
            )
            row = cur.fetchone()
    if not row or not row["is_local_file"] or not row["relative_path"]:
        raise HTTPException(status_code=404, detail="Local media asset not found")

    full_path = (settings.media_root / row["relative_path"]).resolve()
    if not full_path.is_relative_to(settings.media_root.resolve()) or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Media file missing on disk")
    return FileResponse(full_path)


@app.get("/media")
def list_media(
    media_type: str | None = None,
    season: int | None = None,
    team_abbr: str | None = None,
    limit: int = Query(default=50, le=200),
) -> list[dict[str, Any]]:
    """Query registered media assets from PostgreSQL."""
    clauses: list[str] = []
    params: list[Any] = []
    if media_type:
        clauses.append("media_type = %s")
        params.append(media_type)
    if season is not None:
        clauses.append("season = %s")
        params.append(season)
    if team_abbr:
        clauses.append("team_abbr = %s")
        params.append(team_abbr.upper())

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT * FROM media.assets {where_sql} ORDER BY created_at DESC LIMIT %s",
                params,
            )
            return [dict(r) for r in cur.fetchall()]
