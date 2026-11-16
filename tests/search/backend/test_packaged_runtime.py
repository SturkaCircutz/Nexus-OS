"""Source/frozen worker launch paths and browser resource selection."""

import sys

import pytest

import runtime


def test_source_worker_uses_python_module():
    command, directory = runtime.extraction_command()
    assert command == [sys.executable, "-m", "search.extract"]
    assert (directory / "search/extract.py").is_file()


def test_frozen_worker_reenters_executable_and_uses_bundled_browser(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(runtime.Path, "home", lambda: tmp_path)
    for key in ("NEXUS_STORAGE_SCHEMA", "NEXUS_DATABASE_URL", "NEXUS_ARTIFACT_ROOT", "NEXUS_CHECKPOINT_DB"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    monkeypatch.setattr(sys, "executable", str(tmp_path / "nexus-engine.exe"))
    monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", "unrelated-cache")
    (tmp_path / "browsers").mkdir()
    runtime.configure_packaged_runtime()
    assert runtime.os.environ["PLAYWRIGHT_BROWSERS_PATH"] == str(tmp_path / "browsers")
    assert runtime.os.environ["NEXUS_STORAGE_SCHEMA"] == str(tmp_path / "storage/schema.sql")
    assert runtime.os.environ["NEXUS_ARTIFACT_ROOT"] == str(tmp_path / ".nexus/artifacts")
    command, directory = runtime.extraction_command()
    assert command == [str(tmp_path / "nexus-engine.exe"), "--extract-worker"]
    assert directory is None


def test_missing_packaged_browser_is_not_silently_downloaded(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(runtime.Path, "home", lambda: tmp_path)
    for key in ("NEXUS_STORAGE_SCHEMA", "NEXUS_DATABASE_URL", "NEXUS_ARTIFACT_ROOT", "NEXUS_CHECKPOINT_DB"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    with pytest.raises(RuntimeError, match="resources are missing"):
        runtime.configure_packaged_runtime()
