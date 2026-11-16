# Calendar Internal App

## Purpose
The real month from the clock: today and the month at a glance in the small
sizes, a paged month grid in the card size. No invented events — scheduling
arrives when the agent has real memory to schedule with.

## Tech Stack
- React 19 + TypeScript + Vite
- No dependencies: `Date` and the locale's month names

## Folder Layout
```
internal-apps/calendar/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       └── calendar.css
└── backend/
    └── README.md
```

## Registry Entry
`calendar` — sizes `1x1`, `2x1`, `2x2`, default `2x2`; no fullscreen view.
Aliases: calendar, month, schedule.
