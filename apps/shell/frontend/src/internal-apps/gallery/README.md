# Gallery Internal App

## Purpose
The app gallery: every registered app as a tile. Clicking a tile asks the desk to
place the app (`open` through `useDesktopCommands`), so restore, focus and
rearranging follow the same store paths as the agent's commands. A dot marks
apps already on the desk; `·` means minimized.

## Tech Stack
- React 19 + TypeScript + Vite
- UI library: `useDesktopCommands`, `useDesktopInstances` (from `@/ui` — the
  sanctioned WM seam; no `@/wm` imports)

## Folder Layout
```
internal-apps/gallery/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       └── gallery.css
└── backend/
    └── README.md
```

## Registry Entry
`gallery` — sizes `1x2`, `2x1`, `2x2`, `4x2`, default `2x2`; fullscreen view.
Aliases: gallery, apps, launcher.
