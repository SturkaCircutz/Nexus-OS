# Clock Internal App

## Purpose
Clock widget for the NEXUS desktop. It shows more or less detail depending on how much space it has, like a phone widget.

| Size | Grid cells | Shows |
|---|---|---|
| `small` | 1 × 1 | Time |
| `medium` | 2 × 1 | Time + weekday and date |
| `large` | 2 × 2 | Analog face + time + date |

## Tech Stack
- React 19 + TypeScript
- `Intl.DateTimeFormat` for locale-aware time and date (no extra libraries)

## Folder Layout
```
internal-apps/clock/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx      # ClockWidget + CLOCK_GRID_SIZES
│       └── clock.css    # Widget styles (uses the shell's --nexus-* colour tokens)
└── backend/
    └── README.md        # No backend needed
```

## Usage
```tsx
import { ClockWidget } from '@/internal-apps/clock/frontend/src/App'

<ClockWidget />                       // picks small / medium / large from its container
<ClockWidget size="large" />          // fixed size
<ClockWidget hour12={false} showSeconds />
```

Props:
- `size` — `'small' | 'medium' | 'large'`. Leave unset to pick automatically from the container size (240px width/height thresholds).
- `hour12` — `true` 12-hour, `false` 24-hour, unset follows the user's locale.
- `showSeconds` — show seconds in the digital time. Defaults to `false`.

`CLOCK_GRID_SIZES` gives the grid footprint of each size, for the app registry and the desktop grid.

## How to Add a Feature
- New size: add it to `ClockSize`, `CLOCK_GRID_SIZES`, the size rule in `useContainerSize`, and a `.nexus-clock--<size>` style.
- New setting (e.g. time zone): add a prop and pass it into the `Intl.DateTimeFormat` options.

## IPC / API Contracts
None.

## Testing
No tests configured yet. To check by eye, run `npm run dev` from the repo root: the shell shows one clock at each size.
