"""Paths shared by the server and maintenance entry points."""
import os
from pathlib import Path

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)


def database_path():
    """Resolve relative DB_PATH against the project, independent of shell cwd."""
    configured = os.environ.get("DB_PATH", "tutor.db")
    if configured == ":memory:":
        return configured
    path = Path(configured).expanduser()
    if not path.is_absolute():
        path = Path(PROJECT_ROOT) / path
    return str(path.resolve())
