"""Resource and worker paths for source and PyInstaller onedir execution."""

import os
from pathlib import Path
import sys


def configure_packaged_runtime() -> None:
    if getattr(sys, "frozen", False):
        browsers = Path(sys._MEIPASS) / "browsers"
        if not browsers.is_dir():
            raise RuntimeError("Packaged Chromium resources are missing. Reinstall the complete engine package.")
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(browsers)
        os.environ.setdefault("NEXUS_STORAGE_SCHEMA", str(Path(sys._MEIPASS) / "storage/schema.sql"))
        # Writable state belongs outside the read-only application bundle.
        data = Path.home() / ".nexus"
        data.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("NEXUS_DATABASE_URL", f"sqlite:///{(data / 'engine.db').as_posix()}")
        os.environ.setdefault("NEXUS_ARTIFACT_ROOT", str(data / "artifacts"))
        os.environ.setdefault("NEXUS_CHECKPOINT_DB", str(data / "checkpoints.sqlite3"))


def extraction_command() -> tuple[list[str], Path | None]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "--extract-worker"], None
    return [sys.executable, "-m", "search.extract"], Path(__file__).resolve().parent
