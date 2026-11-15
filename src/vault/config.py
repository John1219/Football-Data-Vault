"""Configuration settings for the Football Data Vault."""

from datetime import datetime, timezone
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def current_football_season() -> int:
    """Return the active NFL/CFB season year (Jan-Jul maps to prior year)."""
    now = datetime.now(timezone.utc)
    return now.year if now.month >= 8 else now.year - 1


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = (
        "postgresql://vault_admin:change_me_to_a_strong_password@postgres:5432/football_vault"
    )
    duckdb_path: Path = Path("/data/duckdb/vault.duckdb")
    parquet_root: Path = Path("/data/parquet")
    media_root: Path = Path("/data/media")

    nfl_seasons: str = "2023,2024,2025"
    cfbd_api_key: str = ""
    cfb_seasons: str = "2024,2025"

    sleeper_username: str = ""
    sleeper_league_ids: str = ""

    auto_sync_enabled: bool = False
    auto_sync_interval_hours: int = 24

    def parsed_nfl_seasons(self) -> list[int]:
        """Return configured NFL seasons as a list of integers."""
        return [int(s.strip()) for s in self.nfl_seasons.split(",") if s.strip()]

    def parsed_cfb_seasons(self) -> list[int]:
        """Return configured CFB seasons as a list of integers."""
        return [int(s.strip()) for s in self.cfb_seasons.split(",") if s.strip()]

    def parsed_sleeper_leagues(self) -> list[str]:
        """Return configured Sleeper league IDs."""
        return [s.strip() for s in self.sleeper_league_ids.split(",") if s.strip()]

    def ensure_directories(self) -> None:
        """Create required local storage directories if they do not exist."""
        self.duckdb_path.parent.mkdir(parents=True, exist_ok=True)
        (self.parquet_root / "nfl").mkdir(parents=True, exist_ok=True)
        (self.parquet_root / "cfb").mkdir(parents=True, exist_ok=True)
        (self.parquet_root / "fantasy").mkdir(parents=True, exist_ok=True)
        for subdir in ("audio", "images", "video"):
            (self.media_root / subdir).mkdir(parents=True, exist_ok=True)


settings = Settings()
