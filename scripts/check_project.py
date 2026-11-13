"""Read-only project syntax and local-asset checks, using Python's standard library.

Run: python scripts/check_project.py [--json]
No project modules are imported, no server is started, and no runtime files are written.
Node.js is optional; when available, JavaScript is parsed with ``node --check``.
"""

import argparse
import ast
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tokenize
from urllib.parse import unquote, urlsplit


EXCLUDED_DIRS = {
    ".git", ".venv", "venv", "node_modules", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", "docs",
}
CSS_URL = re.compile(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)]*))\s*\)", re.I)
JS_TYPES = {"", "module", "text/javascript", "application/javascript"}


class PageAssets(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []
        self.inline_scripts = []
        self._inline = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        attribute = {"script": "src", "link": "href", "img": "src"}.get(tag)
        if attribute and attrs.get(attribute):
            self.references.append((tag, attrs[attribute], self.getpos()[0], attrs))
        if tag == "img" and attrs.get("srcset"):
            # A data URL is self-contained; this site's static assets use plain URLs.
            value = attrs["srcset"].strip()
            if not value.startswith("data:"):
                for candidate in value.split(","):
                    parts = candidate.strip().split()
                    if parts:
                        self.references.append((tag, parts[0], self.getpos()[0], attrs))
        if tag == "script" and not attrs.get("src"):
            script_type = attrs.get("type", "").lower()
            if script_type in JS_TYPES:
                self._inline = {
                    "line": self.getpos()[0], "module": script_type == "module", "parts": [],
                }

    def handle_data(self, data):
        if self._inline is not None:
            self._inline["parts"].append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._inline is not None:
            self.inline_scripts.append(self._inline)
            self._inline = None


def check_project(root):
    root = root.resolve()
    counts = Counter()
    errors = []
    notes = []
    script_files = set()
    inline_scripts = []
    manifests = set()
    unique_assets = set()

    def name(path):
        try:
            return path.relative_to(root).as_posix()
        except ValueError:
            return str(path)

    def error(message):
        errors.append(message)

    def reference(owner, url, context):
        url = url.strip()
        if not url or url.startswith("#"):
            return None
        parsed = urlsplit(url)
        if parsed.scheme or parsed.netloc:
            counts["external_or_embedded_references"] += 1
            return None
        decoded = unquote(parsed.path)
        if not decoded:
            return None
        target = (root / decoded.lstrip("/") if decoded.startswith("/")
                  else owner.parent / decoded).resolve()
        counts["local_reference_occurrences"] += 1
        try:
            target.relative_to(root)
        except ValueError:
            error(f"{name(owner)} {context}: reference escapes project root: {url}")
            return None
        unique_assets.add(target)
        if not target.is_file():
            error(f"{name(owner)} {context}: missing local file: {url} -> {name(target)}")
            return None
        return target

    files = sorted(
        path for path in root.rglob("*")
        if path.is_file()
        and not any(part in EXCLUDED_DIRS for part in path.relative_to(root).parts[:-1])
    )
    for path in files:
        suffix = path.suffix.lower()
        if suffix == ".py":
            counts["python_files"] += 1
            try:
                with tokenize.open(path) as handle:
                    ast.parse(handle.read(), filename=name(path))
            except (OSError, SyntaxError, UnicodeError) as exc:
                error(f"Python {name(path)}: {exc}")
        elif suffix == ".json":
            counts["json_files"] += 1
            try:
                json.loads(path.read_text(encoding="utf-8-sig"))
            except (OSError, ValueError, UnicodeError) as exc:
                error(f"JSON {name(path)}: {exc}")
        elif suffix in {".html", ".htm"}:
            counts["html_files"] += 1
            try:
                parser = PageAssets()
                parser.feed(path.read_text(encoding="utf-8-sig"))
                parser.close()
                for tag, url, line, attrs in parser.references:
                    target = reference(path, url, f"line {line} <{tag}>")
                    if target and tag == "script" and attrs.get("type", "").lower() in JS_TYPES:
                        script_files.add(target)
                    if target and tag == "link" and "manifest" in attrs.get("rel", "").lower().split():
                        manifests.add(target)
                inline_scripts.extend((path, item) for item in parser.inline_scripts)
            except (OSError, ValueError, UnicodeError) as exc:
                error(f"HTML {name(path)}: {exc}")
        elif suffix == ".css":
            counts["css_files"] += 1
            try:
                source = path.read_text(encoding="utf-8-sig")
                source = re.sub(r"/\*[\s\S]*?\*/", lambda m: re.sub(r"[^\n]", " ", m[0]), source)
                for match in CSS_URL.finditer(source):
                    url = next(value for value in match.groups() if value is not None).strip()
                    line = source.count("\n", 0, match.start()) + 1
                    reference(path, url, f"line {line} CSS url()")
            except (OSError, ValueError, UnicodeError) as exc:
                error(f"CSS {name(path)}: {exc}")

    if (root / "manifest.json").is_file():
        manifests.add(root / "manifest.json")

    def manifest_icons(value, owner, location="manifest"):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == "icons" and isinstance(item, list):
                    for index, icon in enumerate(item):
                        if isinstance(icon, dict) and isinstance(icon.get("src"), str):
                            counts["manifest_icon_references"] += 1
                            reference(owner, icon["src"], f"{location}.icons[{index}]")
                manifest_icons(item, owner, f"{location}.{key}")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                manifest_icons(item, owner, f"{location}[{index}]")

    for path in sorted(manifests):
        counts["manifest_files"] += 1
        try:
            manifest_icons(json.loads(path.read_text(encoding="utf-8-sig")), path)
        except (OSError, ValueError, UnicodeError) as exc:
            error(f"Manifest {name(path)}: {exc}")

    service_worker = root / "sw.js"
    if service_worker.is_file():
        script_files.add(service_worker)
    counts["unique_local_assets"] = len(unique_assets)
    counts["active_js_files"] = len(script_files)
    counts["inline_js_blocks"] = len(inline_scripts)
    node = shutil.which("node")
    if node is None:
        notes.append("SKIP: Node.js is not installed; active and inline JavaScript syntax checks were skipped.")
        counts["javascript_checks_skipped"] = len(script_files) + len(inline_scripts)
    else:
        jobs = [([node, "--check", str(path)], None, name(path)) for path in sorted(script_files)]
        jobs.extend((
            [node, "--check", "--input-type=" + ("module" if item["module"] else "commonjs")],
            "".join(item["parts"]), f"{name(path)} inline script at line {item['line']}",
        ) for path, item in inline_scripts)
        for command, source, label in jobs:
            try:
                result = subprocess.run(
                    command, input=source, capture_output=True, text=True, encoding="utf-8",
                    errors="replace", timeout=30, cwd=root, check=False,
                )
                counts["javascript_checks_run"] += 1
                if result.returncode:
                    error(f"JavaScript {label}: {(result.stderr or result.stdout).strip()[:1500]}")
            except (OSError, subprocess.SubprocessError) as exc:
                error(f"JavaScript {label}: {exc}")

    return {
        "ok": not errors,
        "root": str(root),
        "counts": dict(sorted(counts.items())),
        "errors": errors,
        "notes": notes,
        "scope": "Static syntax and referenced local files only; no project imports, network access, or runtime writes.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON instead of plain text.")
    args = parser.parse_args()
    if not args.root.is_dir() or not (args.root / "index.html").is_file():
        parser.error("project root must exist and contain index.html")
    report = check_project(args.root)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("PASS" if report["ok"] else "FAIL")
        for key, value in report["counts"].items():
            print(f"  {key}: {value}")
        for note in report["notes"]:
            print(note)
        for message in report["errors"]:
            print(f"ERROR: {message}")
        print(report["scope"])
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
