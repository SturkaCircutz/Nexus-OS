# Building an App on the Baseline UI Library

> Status: guide for the **target** architecture described in [`plan.md`](./plan.md).
> Everything unmarked works **today** with the current shell; items marked
> *(planned Px)* arrive with the corresponding library phase (§8 of the plan).
> Before starting, skim `apps/shell/frontend/DESIGN.md` — it is the design law.

---

## 0. TL;DR — the six steps

1. Create `src/internal-apps/<app>/frontend/src/App.tsx` exporting a component
   that takes `AppProps`.
2. Register it in `src/apps/registry.ts` (label, glyph, sizes, aliases, …).
3. Render content only — **the shell draws your frame**. Style with theme tokens.
4. Persist app data with `localStorage` or your own `backend/` folder.
5. Add a test, and the module `README.md` (required by repo convention).
6. Run `npm run dev` — the grid, Spotlight, dock and agent pick your app up
   automatically. Done.

You never touch the window manager, positioning, focus, or animations. The system
places you in a grid cell and plays the ASCII build-in for you.

---

## 1. The mental model

- **No windows you manage.** The shell gives you a box — `AppProps.size` in widget
  mode, the full stage in fullscreen — and you render content inside it. There are
  no title bars, no dragging, no resizing, and no app ever positions itself.
- **The registry is the single source of truth.** `src/apps/registry.ts` lists every
  app. Spotlight ("apps" section), the dock, the agent's parser and the desktop
  store all read from it. If it isn't in the registry, it doesn't exist.
- **One instance per app type.** The store keys instances by `appId`
  (`desktopStore.find()`); opening an already-open app focuses/resizes it instead of
  duplicating it.
- **Your frame is automatic.** `InstanceHost` wraps every app in `AsciiFrame`
  (the ASCII build-in / move / exit animation and the card surface). Your component
  renders **content only** — never draw your own card border, label or shadow.
- **Three modes.** `widget` (in a cell), `fullscreen` (whole stage, if you declare
  support), `minimized` (hidden in the dock). You stay **mounted** while minimized
  (a hidden keep-alive div), so stop timers/media when you're not visible —
  see §6 and the `useMediaLifecycle` hook *(planned P1)*.

---

## 2. Folder anatomy

Follows the existing internal-app convention (see `internal-apps/notes/`):

```
src/internal-apps/<app>/
├── frontend/
│   ├── package.json        # name only; consumed by the shell workspace
│   └── src/
│       ├── App.tsx         # shell entry point — the only required file
│       ├── <app>.css       # token-only styles, imported by App.tsx
│       └── <app>.test.tsx  # component tests (Vitest + RTL)
├── backend/                # optional: real logic / persistence
│   └── README.md
└── README.md               # module doc — purpose, run, contracts (required)
```

Notes:

- The root `package.json` workspaces already include
  `apps/shell/frontend/internal-apps/*/frontend`, so no workspace wiring is needed.
- `backend/` is optional. Small widgets keep state in `localStorage`; apps with real
  logic (files, system stats) put it in `backend/` and expose it over IPC later.
  Until a backend exists, show **honest placeholders** — never fake data
  (the "never fake system state" principle).

---

## 3. The contract

### 3.1 What the shell gives you — `AppProps`

```ts
// src/apps/types.ts (verbatim)
export type AppMode = 'widget' | 'fullscreen' | 'minimized'

export interface AppProps {
  instanceId: string
  size: Size        // '1x1' | '2x1' | '1x2' | '2x2' | '4x2'
  mode: AppMode
}
```

### 3.2 What you declare — the registry entry

```ts
// src/apps/registry.ts
timer: {
  label: 'timer',            // frame label, dock/Spotlight name, agent reply
  glyph: '[t]',              // 3–5 char ASCII mark; must be unique; dock/Spotlight icon
  sizes: ['1x1', '2x1'],     // every size you have a real layout for
  defaultSize: '1x1',        // what "open timer" places first
  aliases: ['timer', 'countdown', 'stopwatch'],  // words the agent matches on
  fullscreen: false,         // true only if you ship a fullscreen layout
  phase: 'mvp',              // 'mvp' | 'later'
  component: TimerApp,       // ComponentType<AppProps>
},
```

Field effects, so you choose deliberately:

| Field | Where it shows up |
|---|---|
| `label` | AsciiFrame corner label, dock chip, Spotlight row, agent replies ("closed timer.") |
| `glyph` | Dock chip icon, Spotlight glyph column, key hints |
| `sizes` | Spotlight size chips, store `resize`/`nearestSize` behavior, agent "make it bigger" |
| `aliases` | Agent keyword matching (`parseCommand`) and Spotlight prefix search |
| `fullscreen` | Enables ⌘/Ctrl+Enter fullscreen, the dock's `f` key, double-click on your label |

### 3.3 Rules that come with the contract

- **`sizes` is a promise.** Every listed size must have a designed layout (§4).
- **`fullscreen: true` is a promise** too — design the fullscreen view (§7).
- Registering an app does **not** auto-open it. Users/agent open it from
  Spotlight ("apps"), the dock, or by asking ("show my timer").
- New apps are not seeded into `defaultDesktop()`; that list is curated.

---

## 4. Designing for sizes

Grid cells are 160px with 16px gaps (`wm/layout.ts`), so your actual pixel boxes are:

| Size | Pixels | Typical content |
|---|---|---|
| `1x1` | 160×160 | One number, one control, compact meter |
| `2x1` | 336×160 | Wide data: timers, meters, lists, mini tables |
| `1x2` | 160×336 | Vertical: lists, feeds, stacked stats |
| `2x2` | 336×336 | Full content: charts, editors, player |
| `4x2` | 688×336 | Wide surfaces: terminal, dashboards, readers |

Two accepted approaches — pick one per app:

1. **Map the size prop to layouts** (clock's way): `size === '2x2' ? <FullView/> : <CompactView/>`.
2. **Measure the container** with a `ResizeObserver` and pick density (clock also
   supports standalone use this way).

Non-negotiable: **every size you list must look right**, including at the grid's
fit-scale (the whole grid can be scaled down on small windows — never hardcode
against raw viewport pixels; measure your own box).

The `WidgetTemplate` *(planned P1)* formalizes this with a `sizes → content`
mapping, an empty state, and per-size density; until then, apply the mapping by hand
like the clock does.

---

## 5. Using the UI library

### 5.1 What you may import

- **Only from `@/ui`** (the library barrel) and your own files. Never `@/wm`,
  `@/shell`, or another app's internals.
- Style with **theme tokens only** (`--ink`, `--muted`, `--accent`, `--line`,
  `--surface`, `--sans`, `--mono`, …). No raw hex/px values — spacing/typography
  token families land in Phase 0 *(planned)*; until then keep literals minimal and
  swap them when tokens v2 arrives.
- Typography: Inter for prose, JetBrains Mono for labels/data/glyphs
  (DESIGN.md hierarchy).

### 5.2 Component status cheat-sheet

| Need | Today | With the library |
|---|---|---|
| Pressable control | `.chip` / `.chip--action` classes | `Button`, `Chip`, `IconButton` *(P0–P1)* |
| Text/data block | `.w-mono` | `Text`, `Mono`, `Label` *(P0)* |
| Loading | `AsciiSpinner` from `@/ui` | unchanged |
| Inputs | hand-rolled | `Input`, `Textarea`, `SearchField`, `Switch` *(P0–P1)* |
| Meters | hand-rolled `[###...]` | `Meter` / `AsciiMeter` *(P1)* |
| Empty state | hand-rolled line | `EmptyState` *(P1)* |
| Popovers/dialogs | **don't** build ad-hoc | `Popover`, `Dialog` *(P1)* — wait for them |
| Media | — | `MediaSurface` kit *(§8)* |

Rule of thumb: if a primitive exists, use it; if it's planned and you need it now,
build the smallest token-only local version and plan to migrate — don't fork the
system's look.

### 5.3 Things widgets never do

- Draw a card surface/border/label (the frame is automatic).
- Use glass (`.nx-glass` is chrome-only; glass never sits on widgets).
- Introduce a second accent hue or a red error state (One-Accent rule; errors are
  ink + `x`).
- Drag, resize, move or z-index themselves.
- Animate ambient loops while idle (no breathing/pulsing; blink-style irregular
  intervals only).
- Show invented data ("fake CPU 42%") — show honest placeholders instead.

---

## 6. State & persistence

- **Local UI state** → plain React state.
- **Persisted data** → `localStorage` behind try/catch (storage can be unavailable —
  see `notes` for the pattern). Namespaced key: `nexus-<app>`.
- **Real logic** → your `backend/` folder; expose it over IPC later
  (`modules/ipc`). Until then, degrade honestly.
- **Never** touch the desktop store's persistence (`nexus-desktop-v1`) or the WM.

Because you stay mounted while minimized: pause intervals, video, and fetches when
`mode === 'minimized'` or when your box leaves the viewport
(`useMediaLifecycle` *(planned P1)* wraps this; until then, a visibility check in
your effects is enough).

---

## 7. Fullscreen mode

Declare `fullscreen: true` only if you design the view:

- `AppTemplate` *(planned P1)* provides the fullscreen header row (label + your
  actions) — this is **app content**, not window chrome.
- Esc-to-exit and the same-path return-to-cell animation are the shell's job.
- Your instance is **not remounted** when entering/leaving fullscreen — state
  survives by design.
- Fullscreen density is different: 2–3 columns of real content, generous spacing,
  keyboard-first.

---

## 8. Media & info widgets (images, video, articles, search)

Nexus has no browser: all fetched information arrives as widgets. Build them from
the media kit *(planned P1–P2, plan §3.G)*:

- `MediaSurface` — fits media into your cell (`cover`/`contain`), caption + source
  slots.
- `MediaStates` — loading / error (`x` + retry) / empty. Use it for **every**
  async surface; no custom skeletons.
- `SourceBadge` — attribution/citation is mandatory for fetched content.
- `useMediaLifecycle` — lazy decode; pause video when minimized/offscreen.
- The engine delivers typed payloads (`run.response.widgets`, plan §6.3):
  `image | video | article | search`. Your widget maps a payload to a layout —
  don't parse raw HTML, don't hit the network directly from the widget.

Sizing rules: `cover` crops, `contain` letterboxes on `--surface` with the dot
texture; captions wrap in Bubble text; the frame stays the standard paper surface.

---

## 9. Agent & keyboard integration

- **Ask-driven opening:** the agent (keyword parser today, engine later) matches your
  `aliases`. Choose real words: `['timer', 'countdown', 'stopwatch']`. The agent can
  open, resize ("make the timer bigger"), minimize and fullscreen your app using
  only the registry — no per-app agent code needed.
- **Per-app agent actions** (apps declaring custom verbs) are deferred behind the
  Automations design (`AppDef.actions`, commented out in `apps/types.ts`) — don't
  invent your own channel.
- **Keyboard:** desktop keys (⌘K, Esc, ⌘M, ⌘↵) are the shell's. For app-local keys,
  scope listeners to your root element with the `useHotkeys` hook *(planned P2)* —
  never attach global `window` listeners from an app.

---

## 10. Testing & definition of done

Every app ships with:

- [ ] Component test (`Vitest` + RTL *(from Phase 0)*) covering each listed size.
- [ ] Keyboard-only pass: everything reachable and operable without a mouse.
- [ ] Reduced-motion honored for any custom animation (the shell's ASCII frame
      handles its own).
- [ ] Both themes verified (token-only styling makes this nearly free).
- [ ] Minimized behavior verified: timers/media paused, no layout thrash.
- [ ] Module `README.md` (purpose, layout, run, contracts, testing) — required by
      the repo convention.
- [ ] Honest data (no invented numbers).

Run: `cd apps/shell/frontend && npx tsc --noEmit && npm test && npm run build`.

---

## 11. Worked example: a timer widget

### 11.1 `src/internal-apps/timer/frontend/src/App.tsx`

```tsx
import { useEffect, useState } from 'react'
import type { AppProps } from '@/apps/types'
import type { Size } from '@/wm/layout'
import './timer.css'

type Layout = 'small' | 'large'
const LAYOUT: Partial<Record<Size, Layout>> = { '1x1': 'small', '2x1': 'large' }

interface Saved {
  remainingMs: number
  running: boolean
  endsAt: number | null
}

const STORAGE_KEY = 'nexus-timer'

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return raw && typeof raw.remainingMs === 'number' ? raw : { remainingMs: 5 * 60_000, running: false, endsAt: null }
  } catch {
    return { remainingMs: 5 * 60_000, running: false, endsAt: null }
  }
}

export function TimerApp({ size }: AppProps) {
  const layout = LAYOUT[size] ?? 'large'
  const [saved, setSaved] = useState<Saved>(load)
  const { remainingMs, running } = saved

  // One effect drives both running and paused states; cleaned up on unmount.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setSaved((s) => {
        const left = s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs
        return { ...s, remainingMs: left, running: left > 0, endsAt: left > 0 ? s.endsAt : null }
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [running])

  const persist = (next: Saved) => {
    setSaved(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable; keep it in memory */
    }
  }

  const start = () => persist({ ...saved, running: true, endsAt: Date.now() + saved.remainingMs })
  const pause = () => persist({ ...saved, running: false, endsAt: null })
  const reset = () => persist({ remainingMs: 5 * 60_000, running: false, endsAt: null })

  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')

  return (
    <div className={`nx-timer nx-timer--${layout}`}>
      <output className="nx-timer-time" aria-label={`Timer, ${mm} minutes ${ss} seconds remaining`}>
        {mm}:{ss}
      </output>
      <div className="nx-timer-actions">
        {running ? (
          <button type="button" className="chip" onClick={pause}>pause</button>
        ) : (
          <button type="button" className="chip chip--action" onClick={start} disabled={remainingMs === 0}>
            start
          </button>
        )}
        <button type="button" className="chip" onClick={reset}>reset</button>
      </div>
    </div>
  )
}
```

What this example deliberately does right:

- Renders **content only** — no card, no label, no positioning.
- Two sizes from one `size` prop; both are designed (`.nx-timer--small` densifies).
- Persists through try/catch `localStorage` under `nexus-timer`.
- Honest UI: disabled `start` at 0, real remaining time, no fake progress.
- Uses existing primitives (`.chip`, `.chip--action`) — zero bespoke styling.
- Stays mounted while minimized but its interval only runs while `running`.

### 11.2 `src/internal-apps/timer/frontend/src/timer.css`

```css
/* Timer widget. Tokens only — no raw colors. */
.nx-timer {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px; /* swap to --s-md when tokens v2 lands */
  color: var(--ink);
}

.nx-timer-time {
  font-family: var(--mono);
  font-size: 40px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.nx-timer--small .nx-timer-time { font-size: 28px; }

.nx-timer-actions {
  display: flex;
  gap: 8px; /* --s-sm */
}
```

### 11.3 Register it — `src/apps/registry.ts`

```ts
import { TimerApp } from '@/internal-apps/timer/frontend/src/App'

// inside APPS:
timer: {
  label: 'timer',
  glyph: '[t]',
  sizes: ['1x1', '2x1'],
  defaultSize: '1x1',
  aliases: ['timer', 'countdown', 'stopwatch'],
  fullscreen: false,
  phase: 'later',
  component: TimerApp,
},
```

### 11.4 `src/internal-apps/timer/frontend/src/App.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimerApp } from './App'

it('renders the default duration and starts counting', async () => {
  render(<TimerApp instanceId="test" size="1x1" mode="widget" />)
  expect(screen.getByLabelText(/5 minutes 00 seconds remaining/)).toBeVisible()

  await userEvent.click(screen.getByRole('button', { name: 'start' }))
  expect(screen.getByRole('button', { name: 'pause' })).toBeVisible()
})
```

(Size-variant and reduced-motion cases follow the same shape; the shared providers
fixture lives in `ui/testing/fixtures.tsx` *(planned Phase 0)*.)

### 11.5 `src/internal-apps/timer/README.md`

Follow the house format (see `internal-apps/notes/README.md`): Purpose · Tech
Stack · Folder Layout · How to Run · How to Add a Feature · IPC/API Contracts ·
Testing.

### 11.6 Verify

```powershell
cd apps/shell/frontend
npx tsc --noEmit
npm test
npm run dev
```

Open Spotlight (`⌘/Ctrl+K`) → "apps" → `timer`; or type "show my countdown" in the
ask row. Ask the agent to "make the timer bigger" → it resizes to `2x1` using your
declared sizes.

---

## 12. Common pitfalls

| Pitfall | Why it breaks things |
|---|---|
| Drawing your own card/frame/label | Double frames; breaks the ASCII build-in and both themes |
| Hardcoding against `window.innerWidth` | The grid is fit-scaled; measure your own box instead |
| Raw colors / second accent | Breaks light+dark and the One-Accent rule |
| Using `.nx-glass` in a widget | Glass is chrome-only; glass-on-widget is forbidden |
| Global `window` key listeners | Conflicts with desktop keys and overlays |
| New work per frame while minimized | You stay mounted; keep-alive widgets must sleep |
| Importing `@/wm` or `@/shell` | Apps compose from `@/ui`; the WM is not your API |
| Inventing data (fake CPU, fake health) | "Never fake system state" is a product principle |
| Skipping the module README | Repo convention requires it for every module |
