# Settings Internal App

## Purpose
The shell's real switches, gathered in one widget. Today: the theme (paper / ink /
system, the same `useTheme` the menu bar uses). The desk facts and key legend are honest
readouts, not chrome. Later settings (agent voice, motion, engine connection)
each land here as they become real.

## Tech Stack
- React 19 + TypeScript + Vite
- UI library (`@/ui`): `SettingsTemplate` / `SettingsSection` / `SettingsRow`,
  `RadioGroup` + `Radio`, `Kbd`, `useDesktopInstances`
- Theme: `useTheme` from `@/theme` (shell-level infra, like the menu bar)

## Folder Layout
```
internal-apps/settings/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── App.test.tsx
│       └── settings.css
└── backend/
    └── README.md
```

## Registry Entry
`settings` — sizes `1x1`, `2x1`, default `1x1`; no fullscreen view.
Aliases: settings, preferences, config, theme.

## Layout
- `1x1`: the theme picker only.
- `2x1`: appearance (theme + hint), desk facts, key legend — scrolls inside the
  template's ScrollArea.

## How to Add a Feature
Add a `SettingsRow` to a section (or a new `SettingsSection`). Only add a setting
once it really changes something; readouts must be real values.

## Testing
`App.test.tsx` covers both sizes, switching the real theme (data-theme + storage),
and the row labels/descriptions.
