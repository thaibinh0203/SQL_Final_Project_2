"""Application configuration helpers."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus
import os
import tomllib


ENV_FILE = Path(".env")
STREAMLIT_SECRETS_FILE = Path(".streamlit/secrets.toml")


def _load_env_file(file_path: Path) -> dict[str, str]:
    """Load a local .env file so development setup stays simple."""

    if not file_path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def _load_toml_file(file_path: Path) -> dict[str, str]:
    """Load flat string-like keys from a TOML file when present."""

    if not file_path.exists():
        return {}

    data = tomllib.loads(file_path.read_text(encoding="utf-8"))
    return {str(key): str(value) for key, value in data.items()}


def _read_setting(name: str, default: str) -> str:
    """Read settings from environment variables with local .env fallback."""

    env_file_values = _load_env_file(ENV_FILE)
    secrets_file_values = _load_toml_file(STREAMLIT_SECRETS_FILE)
    if os.getenv(name) is not None:
        return str(os.getenv(name))
    if name in env_file_values:
        return env_file_values[name]
    if name in secrets_file_values:
        return secrets_file_values[name]
    try:
        import streamlit as st

        if name in st.secrets:
            return str(st.secrets[name])
    except Exception:
        pass
    return default


@dataclass(frozen=True)
class Settings:
    """Holds resolved runtime settings for database-backed application layers."""

    db_host: str
    db_port: int
    db_user: str
    db_password: str
    db_name: str
    db_echo: bool
    jwt_secret: str
    jwt_exp_minutes: int

    @property
    def sqlalchemy_database_url(self) -> str:
        """Build a SQLAlchemy URL for the MySQL connector driver."""

        encoded_password = quote_plus(self.db_password)
        return (
            f"mysql+mysqlconnector://{self.db_user}:{encoded_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings because configuration should be stable per process."""

    db_echo_raw = _read_setting("DB_ECHO", "false").strip().lower()
    return Settings(
        db_host=_read_setting("DB_HOST", "127.0.0.1"),
        db_port=int(_read_setting("DB_PORT", "3306")),
        db_user=_read_setting("DB_USER", "root"),
        db_password=_read_setting("DB_PASSWORD", ""),
        db_name=_read_setting("DB_NAME", "recruitment_management_system"),
        db_echo=db_echo_raw in {"1", "true", "yes", "on"},
        jwt_secret=_read_setting("JWT_SECRET", "change-this-dev-secret"),
        jwt_exp_minutes=int(_read_setting("JWT_EXP_MINUTES", "120")),
    )
