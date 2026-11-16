# Settings Internal App

## Purpose
The shell's real switches, gathered in one widget. Today: the theme (paper/ink,
same `useTheme` the menu bar uses). The desk facts and key legend are honest
readouts, not chrome. Later settings (agent voice, motion, engine connection)
each land here as they become real.

## Tech Stack
- React 19 + TypeScript + Vite
- UI library: `useDesktopInstances` (from `@/ui`)
- Theme: `useTheme` from `@/theme` (shell-level infra, like the menu bar)

## Folder Layout
```
internal-apps/settings/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       └── settings.css
└── backend/
    └── README.md
```

## Registry Entry
`settings` — sizes `1x1`, `2x1`, default `1x1`; no fullscreen view.
Aliases: settings, preferences, config, theme.
