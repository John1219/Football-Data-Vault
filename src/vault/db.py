"""Database helpers for PostgreSQL and DuckDB."""

from contextlib import contextmanager
from typing import Iterator

import duckdb
import psycopg
from psycopg.rows import dict_row

from vault.config import settings


@contextmanager
def get_pg_conn() -> Iterator[psycopg.Connection]:
    """Yield a PostgreSQL connection with dict row factory."""
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        yield conn


@contextmanager
def get_duckdb_conn() -> Iterator[duckdb.DuckDBPyConnection]:
    """Yield a DuckDB connection backed by the local vault database file."""
    settings.ensure_directories()
    conn = duckdb.connect(str(settings.duckdb_path))
    try:
        yield conn
    finally:
        conn.close()


def log_ingestion_run(
    source: str,
    dataset: str,
    season: int | None,
    row_count: int,
    parquet_path: str | None = None,
    status: str = "success",
    error_message: str | None = None,
) -> None:
    """Record an ingestion run in PostgreSQL."""
    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO nfl.ingestion_runs
                    (source, dataset, season, row_count, parquet_path, status, error_message)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (source, dataset, season, row_count, parquet_path, status, error_message),
            )
        conn.commit()
