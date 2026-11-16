# Search Contracts Module

## Purpose

Shared, provider-neutral schemas and validated examples for Search & Discover.

## Source of Truth

The canonical models live in `apps/engine/backend/search/models.py`. Do not edit `search-contract.schema.json` or the frontend's generated `src/types/search.ts` by hand.

## Contents

```text
modules/search/
├── README.md
├── search-contract.schema.json
└── examples/
```

## Commands

Activate the backend virtual environment and run these commands from the repository root. Generation rejects Pydantic versions that differ from the version pinned in `apps/engine/backend/requirements.txt`.

Generate JSON Schema and TypeScript:

```bash
python scripts/generate-search-contracts.py
```

Validate generated artifacts and examples:

```bash
python scripts/validate-search-contracts.py
```

## Implemented retrieval integration

See the [API reference](../../docs/retrieval/api.md) for the two implemented tools and their HTTP endpoints, and the [run guide](../../docs/retrieval/README.md) for an interactive demo. Image, video, and mixed-search models remain contracts only.
