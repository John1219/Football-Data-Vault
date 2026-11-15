"""CLI entrypoint for Football Data Vault operations."""

import argparse
import json

from vault.db import get_duckdb_conn
from vault.ingest_cfb import sync_cfb
from vault.ingest_nfl import sync_nfl
from vault.ingest_sleeper import sync_sleeper
from vault.ingest_weather import sync_nfl_weather
from vault.media_manager import scan_local_media


def main() -> None:
    """Parse CLI arguments and run the requested vault command."""
    parser = argparse.ArgumentParser(description="Ultimate Football Data Vault CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    nfl_cmd = sub.add_parser("sync-nfl", help="Sync NFL datasets via nflreadpy")
    nfl_cmd.add_argument("--seasons", type=int, nargs="*", default=None)
    nfl_cmd.add_argument("--datasets", type=str, nargs="*", default=None)

    cfb_cmd = sub.add_parser("sync-cfb", help="Sync College Football data via CFBD")
    cfb_cmd.add_argument("--seasons", type=int, nargs="*", default=None)

    sleeper_cmd = sub.add_parser("sync-sleeper", help="Sync Sleeper fantasy data")
    sleeper_cmd.add_argument("--force-players", action="store_true")

    weather_cmd = sub.add_parser("sync-weather", help="Enrich NFL games with Open-Meteo weather")
    weather_cmd.add_argument("--seasons", type=int, nargs="*", default=None)

    sub.add_parser("scan-media", help="Scan /data/media and register files in PostgreSQL")

    query_cmd = sub.add_parser("query", help="Run a SQL query against DuckDB")
    query_cmd.add_argument("sql", type=str)

    args = parser.parse_args()

    if args.command == "sync-nfl":
        print(json.dumps(sync_nfl(seasons=args.seasons, datasets=args.datasets), indent=2))
    elif args.command == "sync-cfb":
        print(json.dumps(sync_cfb(seasons=args.seasons), indent=2))
    elif args.command == "sync-sleeper":
        print(json.dumps(sync_sleeper(force_players=args.force_players), indent=2))
    elif args.command == "sync-weather":
        print(json.dumps(sync_nfl_weather(seasons=args.seasons), indent=2))
    elif args.command == "scan-media":
        print(json.dumps({"registered": scan_local_media()}, indent=2))
    elif args.command == "query":
        with get_duckdb_conn() as con:
            rel = con.execute(args.sql)
            cols = [desc[0] for desc in rel.description] if rel.description else []
            rows = [dict(zip(cols, row)) for row in rel.fetchall()]
            print(json.dumps(rows, indent=2, default=str))


if __name__ == "__main__":
    main()
