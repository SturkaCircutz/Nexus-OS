"""Saved article fixtures remain available without fetching the web."""

from pathlib import Path


def test_representative_html_fixtures_are_present(html_fixtures: Path) -> None:
    filenames = {path.name for path in html_fixtures.glob("*.html")}
    assert filenames >= {
        "article-cluttered.html",
        "article-no-main.html",
        "article-standard.html",
    }


def test_cluttered_fixture_contains_untrusted_script(html_fixtures: Path) -> None:
    fixture = (html_fixtures / "article-cluttered.html").read_text(encoding="utf-8")
    assert "<article>" in fixture
    assert "<script>" in fixture
