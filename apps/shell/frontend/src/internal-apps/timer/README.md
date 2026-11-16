# Timer Internal App

## Purpose
A countdown widget for the desktop grid. The first app built entirely on the baseline UI library (`@/ui`): it renders content only, declares itself through the registry, and asks the window manager for anything placement-related through `useAppActions`.

## Tech Stack
- React 19 + TypeScript + Vite
- UI library: `Button`, `useAppActions` (from `@/ui`)

## Folder Layout
```
internal-apps/timer/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx          # shell entry point (AppProps contract)
│       ├── timer.css        # token-only styles
│       └── App.test.tsx     # Vitest + RTL
├── backend/
│   └── README.md
└── README.md
```

## How to Run
Consumed by `apps/shell/frontend`. Open from Spotlight (`⌘/Ctrl+K` → apps → timer), the agent ("show my timer", "start a countdown"), or ask it to resize ("make the timer bigger").

## How It Works
- Deadline is wall-clock time (`endsAt`), so a running timer keeps counting while minimized in the dock (apps stay mounted there by design).
- State persists to `localStorage` under `nexus-timer` behind try/catch.
- The `hide` chip routes through `useAppActions('timer').requestMinimize()` — the WM seam — never the store directly.

## IPC / API Contracts
None. The registry entry (label, glyph `[t]`, sizes `1x1`/`2x1`, aliases) drives Spotlight, the dock and the agent.

## Testing
`npm test` in `apps/shell/frontend` runs `App.test.tsx`: default duration, start/pause, the finished→reset path, and both size layouts.
