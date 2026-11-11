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


def extraction_command() -> tuple[list[str], Path | None]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "--extract-worker"], None
    return [sys.executable, "-m", "search.extract"], Path(__file__).resolve().parent
