"""Build and smoke-test a native, self-contained engine directory with Chromium."""

import argparse
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "apps/engine/backend"


def native_target() -> str:
    machine = platform.machine().lower()
    architecture = {"amd64": "x64", "x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}.get(machine)
    system = {"win32": "windows", "darwin": "macos", "linux": "linux"}.get(sys.platform)
    if not architecture or not system:
        raise RuntimeError("Unsupported native build platform")
    return f"{system}-{architecture}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", help="Must match this machine, e.g. windows-x64; cross-compilation is unsupported")
    args = parser.parse_args()
    target = native_target()
    if args.target and args.target != target:
        parser.error(f"Build {args.target} on a matching machine; this host is {target}")
    if sys.version_info[:2] != (3, 12):
        parser.error("Release builds require Python 3.12")
    if version("pyinstaller") != "6.22.3" or version("playwright") != "1.65.0":
        parser.error("Install apps/engine/backend/requirements-build.txt before building")
    work = ROOT / "build/sidecar" / target
    browsers = work / "browsers"
    output = ROOT / "dist/sidecar" / target
    work.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PLAYWRIGHT_BROWSERS_PATH"] = str(browsers)
    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium", "--no-shell"], env=env, check=True)
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
        "--name", "nexus-engine", "--distpath", str(output), "--workpath", str(work / "pyinstaller"),
        "--specpath", str(work), "--paths", str(BACKEND),
        "--add-data", f"{ROOT / 'tests/search/fixtures/html'}:demo-fixtures",
        "--add-data", f"{ROOT / 'modules/storage/schema.sql'}:storage",
        "--collect-all", "langgraph", "--copy-metadata", "langchain-core",
        "--collect-all", "playwright", "--collect-all", "trafilatura",
        "--collect-data", "certifi", "--collect-data", "dateparser",
        "--collect-data", "courlan", "--collect-data", "htmldate",
        "--collect-all", "uvicorn", str(BACKEND / "launcher.py"),
    ]
    subprocess.run(command, env=env, cwd=ROOT, check=True)
    package = output / "nexus-engine"
    # Preserve Chromium's native layout/signatures. Letting PyInstaller rewrite
    # browser binaries can break macOS framework paths and vendor signatures.
    shutil.copytree(browsers, package / "_internal/browsers", symlinks=True)
    executable = package / ("nexus-engine.exe" if sys.platform == "win32" else "nexus-engine")
    smoke_env = os.environ.copy()
    for key in ("PYTHONPATH", "PYTHONHOME"):
        smoke_env.pop(key, None)
    smoke_env["PLAYWRIGHT_BROWSERS_PATH"] = str(work / "nonexistent-cache")
    with tempfile.TemporaryDirectory(prefix="nexus-package-smoke-") as cwd:
        subprocess.run([str(executable), "--self-test"], cwd=cwd, env=smoke_env, check=True, timeout=90)
    manifest = {
        "target": target, "python": platform.python_version(), "playwright": version("playwright"),
        "pyinstaller": version("pyinstaller"), "offline_smoke_passed": True,
        "layout": "onedir; distribute the complete directory", "google_live_tested": False,
    }
    (package / "build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Validated native package: {package}")


if __name__ == "__main__":
    main()
