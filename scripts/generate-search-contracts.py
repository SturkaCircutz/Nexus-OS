"""Generate JSON Schema and TypeScript from the canonical Pydantic models."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import pydantic
from pydantic.json_schema import models_json_schema

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "apps" / "engine" / "backend"
SCHEMA_PATH = REPO_ROOT / "modules" / "search" / "search-contract.schema.json"
TYPESCRIPT_PATH = REPO_ROOT / "apps" / "shell" / "frontend" / "src" / "types" / "search.ts"
REQUIREMENTS_PATH = BACKEND_ROOT / "requirements.txt"

sys.path.insert(0, str(BACKEND_ROOT))

from search.models import (  # noqa: E402
    CONTRACT_MODELS,
    DEFAULT_RESULT_LIMIT,
    MAX_CURSOR_LENGTH,
    MAX_QUERY_LENGTH,
    MAX_RESULTS_PER_KIND,
    MAX_TOTAL_RESULTS,
)


def build_schema() -> dict[str, Any]:
    """Build the shared JSON Schema document from all public models."""

    _, schema = models_json_schema(
        [(model, "validation") for model in CONTRACT_MODELS],
        title="NEXUS Search & Discover Contracts",
    )
    schema["$id"] = "https://nexus.local/schemas/search-contract.schema.json"
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    return schema


def required_pydantic_version() -> str:
    for line in REQUIREMENTS_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith("pydantic=="):
            return line.partition("==")[2]
    raise RuntimeError("requirements.txt must pin pydantic with ==")


def validate_generator_version() -> bool:
    expected = required_pydantic_version()
    if pydantic.__version__ == expected:
        return True
    print(
        f"pydantic {expected} is required for deterministic contract generation; "
        f"found {pydantic.__version__}",
        file=sys.stderr,
    )
    return False


def ref_name(reference: str) -> str:
    prefix = "#/$defs/"
    if not reference.startswith(prefix):
        raise ValueError(f"unsupported schema reference: {reference}")
    return reference.removeprefix(prefix)


def ts_type(schema: dict[str, Any]) -> str:
    """Convert the JSON Schema subset emitted by the search models to TypeScript."""

    if "$ref" in schema:
        return ref_name(schema["$ref"])
    if "const" in schema:
        return json.dumps(schema["const"])
    if "enum" in schema:
        return " | ".join(json.dumps(value) for value in schema["enum"])
    if "oneOf" in schema:
        return union_type(ts_type(member) for member in schema["oneOf"])
    if "anyOf" in schema:
        return union_type(ts_type(member) for member in schema["anyOf"])
    if "allOf" in schema:
        return " & ".join(ts_type(member) for member in schema["allOf"])

    schema_type = schema.get("type")
    if schema_type == "string":
        return "string"
    if schema_type in {"integer", "number"}:
        return "number"
    if schema_type == "boolean":
        return "boolean"
    if schema_type == "null":
        return "null"
    if schema_type == "array":
        return f"Array<{ts_type(schema.get('items', {}))}>"
    if schema_type == "object":
        additional = schema.get("additionalProperties")
        if isinstance(additional, dict):
            return f"Record<string, {ts_type(additional)}>"
        properties = schema.get("properties", {})
        required = set(schema.get("required", []))
        fields = []
        for name, field_schema in properties.items():
            optional = "" if name in required else "?"
            fields.append(f"{name}{optional}: {ts_type(field_schema)}")
        return "{ " + "; ".join(fields) + " }"
    if not schema:
        return "unknown"
    raise ValueError(f"unsupported schema fragment: {schema}")


def union_type(members: Any) -> str:
    unique_members = list(dict.fromkeys(members))
    return " | ".join(unique_members)


def render_definition(name: str, schema: dict[str, Any]) -> str:
    if schema.get("type") == "object" and "properties" in schema:
        required = set(schema.get("required", []))
        lines = [f"export interface {name} {{"]
        for property_name, property_schema in schema["properties"].items():
            if not re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", property_name):
                rendered_name = json.dumps(property_name)
            else:
                rendered_name = property_name
            optional = "" if property_name in required else "?"
            lines.append(f"  {rendered_name}{optional}: {ts_type(property_schema)}")
        lines.append("}")
        return "\n".join(lines)
    return f"export type {name} = {ts_type(schema)}"


def find_search_result_union(schema: dict[str, Any]) -> list[str]:
    result_items = (
        schema["$defs"]["MixedSearchResponse"]["properties"]["results"]["items"]
    )
    mapping = result_items["discriminator"]["mapping"]
    return [ref_name(mapping[kind]) for kind in sorted(mapping)]


def render_typescript(schema: dict[str, Any]) -> str:
    definitions = schema["$defs"]
    blocks = [
        "// Generated by scripts/generate-search-contracts.py. Do not edit by hand.",
        "",
        f"export const MAX_QUERY_LENGTH = {MAX_QUERY_LENGTH} as const",
        f"export const DEFAULT_RESULT_LIMIT = {DEFAULT_RESULT_LIMIT} as const",
        f"export const MAX_RESULTS_PER_KIND = {MAX_RESULTS_PER_KIND} as const",
        f"export const MAX_TOTAL_RESULTS = {MAX_TOTAL_RESULTS} as const",
        f"export const MAX_CURSOR_LENGTH = {MAX_CURSOR_LENGTH} as const",
        "",
    ]
    blocks.extend(render_definition(name, definitions[name]) + "\n" for name in sorted(definitions))
    result_types = " | ".join(find_search_result_union(schema))
    blocks.append(f"export type SearchResult = {result_types}\n")
    return "\n".join(blocks).rstrip() + "\n"


def render_schema(schema: dict[str, Any]) -> str:
    return json.dumps(schema, indent=2, sort_keys=True) + "\n"


def write_or_check(path: Path, content: str, check: bool) -> bool:
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            print(f"out of date: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
            return False
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"generated: {path.relative_to(REPO_ROOT)}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail when generated artifacts differ from the canonical Pydantic models",
    )
    args = parser.parse_args()

    if not validate_generator_version():
        return 2

    schema = build_schema()
    results = (
        write_or_check(SCHEMA_PATH, render_schema(schema), args.check),
        write_or_check(TYPESCRIPT_PATH, render_typescript(schema), args.check),
    )
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
