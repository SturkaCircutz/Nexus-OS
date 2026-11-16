# System Monitor Internal App

## Purpose
Built-in system resource monitor widget mountable on the NEXUS desktop canvas.

Until the backend reports real numbers it shows an honest "no telemetry yet" empty
state — never invented readings ("never fake system state"). The `AsciiMeter`
layout for real readings (`cpu`, `mem`, optional `gpu`) is already in place.

## Tech Stack
- React 19 + TypeScript + Vite

## Folder Layout
```
internal-apps/system-monitor/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx       # SystemMonitorApp + pure SystemMonitorView
│       ├── App.test.tsx
│       └── sysmon.css
└── backend/
    └── README.md
```

## How to Run
Consumed by `apps/shell/frontend`.

## How to Add a Feature
Wire up backend telemetry (CPU/RAM/GPU) via Rust `commands`, then make
`useReadings()` in `App.tsx` poll it and return `Readings` (pause while the
widget is minimized). Nothing else needs to change: the view switches from the
empty state to meters as soon as readings arrive.

## IPC / API Contracts
Expose system metrics via Tauri commands in `src-tauri/src/commands/`.

## Testing
`App.test.tsx`: the empty state at both sizes (no meters, no numbers), real
readings drawn as labelled meters, and machines without a GPU.
