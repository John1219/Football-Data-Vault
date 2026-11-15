# Ultimate Football Data Vault

A self-hosted, Dockerized personal football data vault combining:
- **PostgreSQL 18** (`nfl`, `cfb`, `fantasy`, `media` schemas) for relational metadata, ingestion logs, CFB/Sleeper records, and media asset indexing.
- **DuckDB 2.0 + Parquet** (`/data/parquet` & `/data/duckdb/vault.duckdb`) for fast analytical queries over `nflverse` play-by-play, rosters, contracts, draft, combine, and CFB datasets.
- **Local Media Vault** (`/data/media/{audio,images,video}`) for archiving public-domain/CC media files alongside link-only metadata for copyrighted streams (YouTube, NFL+).

## Quick Start

1. **Create `.env` from the template:**
   ```powershell
   Copy-Item .env.example .env
   ```
   Edit `.env` to set a strong `POSTGRES_PASSWORD`, and optionally add your `CFBD_API_KEY` (from https://collegefootballdata.com/key) and `SLEEPER_USERNAME` / `SLEEPER_LEAGUE_IDS`.

2. **Start the Docker Compose stack:**
   ```powershell
   docker compose up -d --build
   ```
   Both services bind strictly to `127.0.0.1` (`5432` for PostgreSQL, `8000` for the FastAPI service).

3. **Verify health:**
   ```powershell
   curl http://127.0.0.1:8000/health
   ```

4. **Run initial data syncs:**
   ```powershell
   # Sync NFL schedules, rosters, stats, PBP, injuries, contracts, draft, combine
   docker compose exec vault-api python -m vault.cli sync-nfl --seasons 2024 2025

   # Sync Sleeper NFL player directory + your configured leagues
   docker compose exec vault-api python -m vault.cli sync-sleeper

   # Sync College Football (requires CFBD_API_KEY in .env)
   docker compose exec vault-api python -m vault.cli sync-cfb --seasons 2024 2025
   ```

5. **Query DuckDB directly:**
   ```powershell
   docker compose exec vault-api python -m vault.cli query "SELECT season, COUNT(*) AS games FROM nfl_schedules GROUP BY season ORDER BY season"
   ```

6. **Add local media:**
   Drop public-domain/CC files into `./data/media/audio`, `./data/media/images`, or `./data/media/video`, then run:
   ```powershell
   docker compose exec vault-api python -m vault.cli scan-media
   ```
   For copyrighted/DRM streams (NFL+, YouTube), register them as link-only metadata via `POST http://127.0.0.1:8000/media/register` with `"is_local_file": false`.
