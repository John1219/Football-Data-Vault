-- Ultimate Football Data Vault: PostgreSQL Schema

CREATE SCHEMA IF NOT EXISTS nfl;
CREATE SCHEMA IF NOT EXISTS cfb;
CREATE SCHEMA IF NOT EXISTS fantasy;
CREATE SCHEMA IF NOT EXISTS media;

-- Track bulk Parquet/API ingestion runs
CREATE TABLE IF NOT EXISTS nfl.ingestion_runs (
    id              BIGSERIAL PRIMARY KEY,
    source          TEXT NOT NULL,          -- e.g. 'nflverse', 'cfbd', 'sleeper'
    dataset         TEXT NOT NULL,          -- e.g. 'pbp', 'schedules', 'rosters'
    season          INT,
    row_count       BIGINT NOT NULL DEFAULT 0,
    parquet_path    TEXT,
    status          TEXT NOT NULL DEFAULT 'success',
    error_message   TEXT,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- College Football (CFBD) reference tables
CREATE TABLE IF NOT EXISTS cfb.teams (
    id              INT PRIMARY KEY,
    school          TEXT NOT NULL,
    mascot          TEXT,
    abbreviation    TEXT,
    conference      TEXT,
    division        TEXT,
    classification  TEXT,
    color           TEXT,
    alt_color       TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cfb.games (
    id              BIGINT PRIMARY KEY,
    season          INT NOT NULL,
    week            INT NOT NULL,
    season_type     TEXT NOT NULL,
    start_date      TIMESTAMPTZ,
    completed       BOOLEAN,
    home_team       TEXT NOT NULL,
    home_points     INT,
    away_team       TEXT NOT NULL,
    away_points     INT,
    venue           TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fantasy (Sleeper) tables
CREATE TABLE IF NOT EXISTS fantasy.sleeper_players (
    player_id       TEXT PRIMARY KEY,
    full_name       TEXT,
    first_name      TEXT,
    last_name       TEXT,
    position        TEXT,
    team            TEXT,
    status          TEXT,
    age             INT,
    years_exp       INT,
    raw_json        JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy.sleeper_leagues (
    league_id       TEXT PRIMARY KEY,
    name            TEXT,
    season          TEXT,
    sport           TEXT,
    status          TEXT,
    total_rosters   INT,
    raw_json        JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Media Vault metadata (local files in /data/media + external link-only URLs)
CREATE TABLE IF NOT EXISTS media.assets (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    description     TEXT,
    media_type      TEXT NOT NULL CHECK (media_type IN ('audio', 'image', 'video')),
    is_local_file   BOOLEAN NOT NULL DEFAULT TRUE,
    relative_path   TEXT,                   -- relative to MEDIA_ROOT when is_local_file = true
    source_url      TEXT,                   -- original URL or link-only stream/embed URL
    source_name     TEXT,                   -- e.g. 'Library of Congress', 'Wikimedia Commons', 'NFL YouTube'
    license         TEXT,                   -- e.g. 'Public Domain', 'CC-BY 4.0', 'Link-Only (Copyrighted)'
    league          TEXT CHECK (league IN ('NFL', 'CFB', 'OTHER')),
    season          INT,
    game_id         TEXT,
    team_abbr       TEXT,
    player_id       TEXT,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    sha256          TEXT,
    file_size_bytes BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (relative_path)
);

CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media.assets (media_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_season_team ON media.assets (season, team_abbr);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON media.assets USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_cfb_games_season_week ON cfb.games (season, week);
