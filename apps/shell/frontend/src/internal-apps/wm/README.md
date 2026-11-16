# Window Manager Widget

## Purpose
The desk as a list: one row per open app with size−/size+, fullscreen,
minimize/restore and close, plus desk-wide `tidy` and `clear desk`. Every action
goes through `useDesktopCommands` (the `@/ui` seam), so the widget drives exactly
the store commands the agent's chat commands use — no direct `@/wm` imports.

## Tech Stack
- React 19 + TypeScript + Vite
- UI library: `useDesktopCommands`, `useDesktopInstances` (from `@/ui`)

## Folder Layout
```
internal-apps/wm/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       └── wm.css
└── backend/
    └── README.md
```

## Registry Entry
`wm` — sizes `2x1`, `2x2`, default `2x2`; no fullscreen view (the rows are the
interface). Aliases: wm, windows, layout, arrange, desk.
