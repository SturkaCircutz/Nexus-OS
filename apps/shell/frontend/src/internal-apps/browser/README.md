# Browser Internal App

## Purpose
The headless-browser widget: a search field and a reader that render the typed
payloads the web-search team's tools produce — `search` result lists, `article`
blocks, `image` and `video` payloads (`src/types/agentEvents.ts`), drawn with the
media kit (`MediaSurface`, `SourceBadge`). Built for the engine, running without
one: data flows through a `BrowserSource` seam, currently the offline fixture
source, so nothing fakes a network.

## Coordination with the web-search team
- The engine implements `BrowserSource` (`search` / `open`) behind the shell's
  IPC commands `search_web` / `fetch_article` (`src/types/ipc.ts`).
- Payloads must keep the `WidgetPayload` shapes — change them together with
  `apps/engine/backend/schemas/contracts.py`.
- The source seam lives in `frontend/src/source.ts`; swap `fixtureSource` for the
  IPC-backed one and the widget needs no changes.

## Tech Stack
- React 19 + TypeScript + Vite
- UI library: `MediaSurface`, `SourceBadge`, `SearchField` (from `@/ui`)

## Folder Layout
```
internal-apps/browser/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── source.ts
│       └── browser.css
└── backend/
    └── README.md
```

## Registry Entry
`browser` — sizes `2x1`, `2x2`, `4x2`, default `2x2`; fullscreen view.
Aliases: browser, web, search, browse.
