"""Start the application with a consistent project root and database backup."""
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from backend.paths import PROJECT_ROOT, database_path

load_dotenv(Path(PROJECT_ROOT) / ".env")


def backup_database():
    db_file = database_path()
    if db_file == ":memory:" or not Path(db_file).is_file():
        return
    try:
        keep = max(1, int(os.environ.get("BACKUP_KEEP", "10")))
        backup_dir = Path(PROJECT_ROOT) / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        target = backup_dir / f"tutor_{stamp}.db"
        with sqlite3.connect(f"file:{Path(db_file).as_posix()}?mode=ro", uri=True) as source:
            with sqlite3.connect(target) as destination:
                source.backup(destination)
        backups = sorted(backup_dir.glob("tutor_*.db"))
        for old in backups[:-keep]:
            old.unlink()
        print(f"[backup] Database saved to {target.name}")
    except Exception as exc:
        print(f"[backup] Backup failed: {exc}")


if __name__ == "__main__":
    backup_database()
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")),
                reload=False, proxy_headers=True, app_dir=PROJECT_ROOT)
