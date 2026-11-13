"""Offline smoke checks in a disposable copy; never touches the live database.

Run from any directory: python scripts/smoke_test.py --report work/backend-smoke.json
"""
import argparse
import ast
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parent.parent


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", default=str(ROOT / "work" / "backend-smoke.json"))
    parser.add_argument("--work-dir", default=str(ROOT / "work"))
    args = parser.parse_args()
    work = Path(args.work_dir).resolve()
    work.mkdir(parents=True, exist_ok=True)
    results = []

    def passed(name, **details):
        results.append({"check": name, "passed": True, **details})

    try:
        python_files = list(ROOT.rglob("*.py"))
        python_files = [p for p in python_files if not any(part in ("work", ".venv", "__pycache__") for part in p.relative_to(ROOT).parts)]
        for path in python_files:
            ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        passed("python_syntax", files=len(python_files))

        with tempfile.TemporaryDirectory(prefix="backend-smoke-", dir=work) as scratch:
            scratch = Path(scratch)
            app_dir = scratch / "app"
            shutil.copytree(ROOT, app_dir, ignore=shutil.ignore_patterns(
                "work", ".venv", "__pycache__", ".git", ".env", "*.db", "*.db-*", "auth_secret.key", "backups", "*.log"))
            env = os.environ.copy()
            for key in list(env):
                if key.startswith(("LLM_", "SPARK_IMAGE_", "ALIBABA_")) or key in ("AUTH_SECRET", "ADMIN_PASSWORD"):
                    env.pop(key)
            env.update({"LLM_API_KEY": "", "ENABLE_DEMO_SEED": "false", "PYTHONIOENCODING": "utf-8",
                        "PYTHONDONTWRITEBYTECODE": "1", "MPLCONFIGDIR": str(scratch / "mpl"),
                        "DB_PATH": "smoke.db", "PYTHONPATH": str(app_dir)})

            # Import, absolute data resolution, consistent backup, and existing-user preservation.
            code = '''
import os, sqlite3
from pathlib import Path
from backend import main
import run
assert Path(main.DB_PATH).parent == Path(main.PROJECT_ROOT)
assert main._load_kp_meta()
assert main.retrieve("逆矩阵", top_k=2)
assert main.app is __import__("main").app
db = main._db
db.execute("INSERT INTO users(username,password_hash,salt,role,status) VALUES ('smoke-existing','synthetic-hash','synthetic-salt','user','active')")
db.execute("INSERT INTO notes(user_id,question,answer,note) VALUES (1,'preserve-me','synthetic-answer','synthetic-note')")
db.commit()
before = db.execute("SELECT id,username,password_hash,role FROM users ORDER BY id").fetchall()
notes_before = db.execute("SELECT * FROM notes").fetchall()
os.environ['ENABLE_DEMO_SEED'] = 'true'
main._seed_done = False
main.ensure_seed_data(db)
assert db.execute("SELECT id,username,password_hash,role FROM users ORDER BY id").fetchall() == before
assert db.execute("SELECT * FROM notes").fetchall() == notes_before
main.ensure_admin()
assert not db.execute("SELECT 1 FROM users WHERE username='admin'").fetchone()
run.backup_database()
backups=list((Path(main.PROJECT_ROOT)/'backups').glob('tutor_*.db'))
assert len(backups)==1
with sqlite3.connect(backups[0]) as backup:
    assert backup.execute("SELECT username FROM users").fetchone()[0] == 'smoke-existing'
db.close()
'''
            completed = subprocess.run([sys.executable, "-c", code], cwd=scratch, env=env, capture_output=True, text=True, encoding="utf-8", timeout=60)
            if completed.returncode:
                raise AssertionError("isolated import/data checks failed: " + completed.stderr[-1600:])
            passed("import_and_paths")
            passed("rag_and_metadata_read")
            passed("existing_users_and_notes_preserved")
            passed("no_default_admin_password")
            passed("sqlite_backup_uses_DB_PATH")

            bootstrap_code = '''
import os
from backend import main
db = main._db
assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
assert main.routes_self_path.self_train_status()['running'] is False
os.environ['ENABLE_DEMO_SEED'] = 'true'
main.ensure_seed_data(db)
assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == len(main._load_seed()['users'])
db.close()
'''
            bootstrap_env = {**env, "DB_PATH": "bootstrap.db"}
            completed = subprocess.run([sys.executable, "-c", bootstrap_code], cwd=scratch, env=bootstrap_env,
                                       capture_output=True, text=True, encoding="utf-8", timeout=45)
            if completed.returncode:
                raise AssertionError("explicit empty-database bootstrap failed: " + completed.stderr[-1200:])
            passed("explicit_demo_seed_on_empty_database")
            passed("missing_training_state_is_not_running")

            admin_code = '''
import os, secrets
from backend import main
password = secrets.token_hex(20)
os.environ['ADMIN_PASSWORD'] = password
main.ensure_admin()
assert main.authenticate('admin', password)['role'] == 'admin'
before = main._db.execute("SELECT password_hash FROM users WHERE username='admin'").fetchone()[0]
os.environ['ADMIN_PASSWORD'] = secrets.token_hex(20)
main.ensure_admin()
assert main._db.execute("SELECT password_hash FROM users WHERE username='admin'").fetchone()[0] == before
main._db.close()
'''
            completed = subprocess.run([sys.executable, "-c", admin_code], cwd=scratch, env={**env, "DB_PATH": "admin.db"},
                                       capture_output=True, text=True, encoding="utf-8", timeout=45)
            if completed.returncode:
                raise AssertionError("environment admin bootstrap failed: " + completed.stderr[-1200:])
            passed("environment_admin_bootstrap_and_existing_password_preserved")

            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            env["PORT"] = str(port)
            base = f"http://127.0.0.1:{port}"
            opener = build_opener(NoRedirect())

            def fetch(path, data=None):
                encoded = None if data is None else json.dumps(data).encode()
                req = Request(base + path, data=encoded, headers={"Content-Type": "application/json"})
                try:
                    response = opener.open(req, timeout=20)
                except HTTPError as exc:
                    response = exc
                with response:
                    return response.status, response.headers, response.read()

            with (scratch / "server.log").open("w", encoding="utf-8") as logfile:
                proc = subprocess.Popen([sys.executable, str(app_dir / "run.py")], cwd=scratch, env=env,
                                        stdout=logfile, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic() + 45
                    while True:
                        if proc.poll() is not None:
                            raise AssertionError("server exited during startup")
                        try:
                            status, _, body = fetch("/api/version")
                            if status == 200:
                                break
                        except (URLError, OSError):
                            pass
                        if time.monotonic() > deadline:
                            raise AssertionError("server startup timed out")
                        time.sleep(.25)
                    passed("run_py_HTTP_from_other_cwd", version=json.loads(body))

                    for path in ("/", "/metadata.json", "/manifest.json", "/sw.js", "/assets/icons/icon-192.png", "/assets/icons/icon-512.png", "/assets/icons/icon-180.png"):
                        status, _, body = fetch(path)
                        assert status == 200 and body, (path, status)
                    passed("homepage_metadata_and_all_PWA_assets")

                    original = fetch("/manifest.json")[2]
                    attacked = fetch("/manifest.json?_file=backend/main.py&_mime=text/plain")[2]
                    assert attacked == original
                    for path in ("/backend/main.py", "/main.py", "/.env", "/seed_data.json", "/smoke.db"):
                        assert fetch(path)[0] == 404, path
                    passed("PWA_query_cannot_override_path_and_private_files_not_served")

                    old = "/uploads/apk/" + quote("秩研Agent-1.0.6.apk")
                    status, headers, _ = fetch(old)
                    assert status == 307
                    assert headers["Location"] == "/uploads/downloads/" + quote("秩研Agent-1.0.6.apk")
                    passed("legacy_APK_redirect", status=status)

                    for task, matrix in (("det", [[3,1],[2,4]]), ("inverse", [[2,0],[0,4]]), ("eigen", [[2,0],[0,3]])):
                        status, _, body = fetch("/api/engine/solve", {"task": task, "matrix": matrix})
                        result = json.loads(body)
                        assert status == 200 and result.get("verified") is True, (task, status, result.get("detail"))
                        if task == "det":
                            assert "10" in result["symbolic"]
                        passed("engine_"+task, verified=True)
                    status, _, body = fetch("/api/rag/search", {"query": "矩阵的逆", "top_k": 3})
                    assert status == 200 and json.loads(body)["count"] > 0
                    passed("rag_HTTP_search")
                finally:
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=5)
    except Exception as exc:
        results.append({"check": "execution", "passed": False, "error": str(exc)})
    report = {"passed": all(r["passed"] for r in results), "checks": results,
              "limitations": ["No external LLM, SMS, OAuth, OCR service or GPU training calls were made."]}
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
