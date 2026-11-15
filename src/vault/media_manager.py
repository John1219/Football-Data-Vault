"""Media vault manager for local files (audio/images/video) and link-only URLs."""

import hashlib
from pathlib import Path
from typing import Any

from vault.config import settings
from vault.db import get_pg_conn

EXTENSION_MEDIA_TYPE: dict[str, str] = {
    ".mp3": "audio",
    ".wav": "audio",
    ".flac": "audio",
    ".m4a": "audio",
    ".ogg": "audio",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".webp": "image",
    ".gif": "image",
    ".tif": "image",
    ".tiff": "image",
    ".mp4": "video",
    ".mkv": "video",
    ".mov": "video",
    ".webm": "video",
}


def _sha256_file(path: Path) -> str:
    """Compute SHA-256 hex digest of a file."""
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def register_media_asset(
    title: str,
    media_type: str,
    is_local_file: bool = True,
    relative_path: str | None = None,
    source_url: str | None = None,
    source_name: str | None = None,
    license_name: str | None = None,
    league: str | None = None,
    season: int | None = None,
    game_id: str | None = None,
    team_abbr: str | None = None,
    player_id: str | None = None,
    tags: list[str] | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Register a local media file or external link-only URL in PostgreSQL."""
    sha256_hex: str | None = None
    size_bytes: int | None = None

    if is_local_file:
        if not relative_path:
            raise ValueError("relative_path is required when is_local_file=True")
        full_path = (settings.media_root / relative_path).resolve()
        if not full_path.is_relative_to(settings.media_root.resolve()):
            raise ValueError("relative_path must stay inside MEDIA_ROOT")
        if not full_path.is_file():
            raise FileNotFoundError(f"Media file not found: {full_path}")
        sha256_hex = _sha256_file(full_path)
        size_bytes = full_path.stat().st_size

    with get_pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO media.assets (
                    title, description, media_type, is_local_file, relative_path,
                    source_url, source_name, license, league, season, game_id,
                    team_abbr, player_id, tags, sha256, file_size_bytes
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (relative_path) DO UPDATE SET
                    title = EXCLUDED.title,
                    sha256 = EXCLUDED.sha256,
                    file_size_bytes = EXCLUDED.file_size_bytes
                RETURNING *
                """,
                (
                    title,
                    description,
                    media_type,
                    is_local_file,
                    relative_path,
                    source_url,
                    source_name,
                    license_name,
                    league,
                    season,
                    game_id,
                    team_abbr,
                    player_id,
                    tags or [],
                    sha256_hex,
                    size_bytes,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}


def scan_local_media() -> int:
    """Scan MEDIA_ROOT/{audio,images,video} and register any untracked files."""
    settings.ensure_directories()
    registered = 0
    for root_dir in ("audio", "images", "video"):
        folder = settings.media_root / root_dir
        for path in folder.rglob("*"):
            if not path.is_file():
                continue
            media_type = EXTENSION_MEDIA_TYPE.get(path.suffix.lower())
            if not media_type:
                continue
            rel = path.relative_to(settings.media_root).as_posix()
            register_media_asset(
                title=path.stem.replace("_", " ").replace("-", " "),
                media_type=media_type,
                is_local_file=True,
                relative_path=rel,
                source_name="Local Vault",
            )
            registered += 1
    return registered
