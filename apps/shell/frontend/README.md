# Shell Frontend (Presentation Shell)

## Purpose
React 19 desktop shell hosted inside Tauri. Renders the ASCII-styled desktop: a dot-field background, a 6×4 snap grid of app widgets, and floating glass chrome (menu bar, Spotlight, a dock that shows when needed, and the agent orb). There are no window title bars; the agent and the grid manage layout. Light and dark modes come from CSS tokens. Product and design records: `PRODUCT.md`, `DESIGN.md`.

## Tech Stack
- React 19, TypeScript, plain CSS with tokens, Vite, MediaPipe Tasks Vision

## Folder Layout
```
apps/shell/frontend/
├── package.json
├── vite.config.ts           # + vitest config (jsdom, setup file)
├── tsconfig.json
├── src/
│   ├── main.tsx             # font + layer CSS imports, mounts <Desktop/>
│   ├── shell/               # Desktop (layers + global keys), WidgetGrid (slots + hover chips), DotField (soul glow)
│   │   ├── InstanceHost.tsx # renders each app once and moves it between grid / fullscreen / minimized without remounting (per-instance ErrorBoundary)
│   │   ├── hostNodes.ts     # the detached host nodes + FLIP claim/release
│   │   ├── chrome/          # MenuBar, AnchorPicker, Spotlight (⌘K), Dock, FullscreenHost + chrome.css
│   │   ├── avatar/          # AgentAvatar (drag/flick), AgentBubble (StreamingText), AvatarArt + orbitEngine.ts (the ORBIT orb, token-colored)
│   │   └── agent/           # agentStore (status, reply, avatar anchor), parseCommand, runCommand, engineClient (doc 07 client, tests)
│   ├── wm/                  # layout.ts (grid packing, pure fns) + layout.test.ts, desktopStore.tsx (external store, localStorage) + desktopStore.test.ts
│   ├── apps/                # registry.ts: one AppDef per app (sizes, aliases, component)
│   ├── ui/                  # THE UI LIBRARY — public API is the `@/ui` barrel only
│   │   ├── tokens/          # tokens.css (v2) + motion.ts (DUR/FRAME_MS/TYPE_MS/STAY_MS)
│   │   ├── motion/          # spring.ts (Springs), timeline.ts (animate)
│   │   ├── ascii/           # AsciiFrame, AsciiSpinner, AsciiMeter, AsciiFace, glyphs
│   │   ├── components/      # Text, Button, Markers, Status, Input, Controls, Popover, Select, Layout
│   │   ├── overlays/        # Dialog, Toast, EmptyState, ErrorBoundary, ConfirmPanel, trapTab
│   │   ├── ai/              # AgentStatus, StreamingText, PromptInput, ActivityTimeline, ToolCard, InterruptPanel
│   │   ├── media/           # MediaSurface, MediaStates, SourceBadge, useMediaLifecycle
│   │   ├── templates/       # WidgetTemplate, AppTemplate
│   │   ├── integration.ts   # the sanctioned ui ⇄ wm/shell seam (useAppActions, useDesktopCommands, useDesktopInstances)
│   │   ├── testing/         # setup.ts, a11y.ts (matchMedia stub), fixtures.tsx
│   │   ├── index.ts         # barrel — import from '@/ui', never from ui/* folders
│   │   └── *.css            # one stylesheet per layer
│   ├── theme/               # ThemeProvider (light/dark/system), useReducedMotion
│   ├── hooks/               # useIPC, useGesture
│   ├── internal-apps/       # clock, notes, files, terminal, system-monitor, timer, gallery, browser, wm, settings, calc, calendar (frontend + backend each)
│   ├── vision/              # MediaPipe landmark detection
│   └── types/               # ipc.ts, agentEvents.ts (wire contract + WidgetPayload)
└── README.md
```

## How to Run
```powershell
cd apps/shell/frontend
npm install
npm run dev
```

## How to Add a Feature
1. New internal app → build it in `src/internal-apps/<app>/frontend` (component takes `AppProps`: `size`, `mode`, `instanceId`), then add an entry to `src/apps/registry.ts`. Use `AppTemplate`/`WidgetTemplate` and import everything else from `@/ui`. The grid, Spotlight, dock and agent pick it up from the registry. See `docs/ui-library/app-guide.md`.
2. New shared component → `src/ui/` (right layer: components → overlays → ai → media → templates), styled only with theme tokens so it works in light and dark, exported through `src/ui/index.ts`. Animations use the springs in `src/ui/motion/spring.ts` and must handle reduced motion.
3. Desktop behavior (new layout action) → `src/wm/desktopStore.tsx`. Agent wording → `src/shell/agent/parseCommand.ts`, and what the command does → `src/shell/agent/runCommand.ts`.
4. Floating chrome (anything that sits above the grid) → `src/shell/chrome/`, using `.nx-glass`. Glass never sits on glass: popovers inside chrome use a solid `--surface`. Widget controls that sit on the grid itself (the slot chips) live in `WidgetGrid.tsx` — they are shell chrome, not window chrome.
5. Hook → `src/hooks/`; type → `src/types/`.

## Keys
- ⌘/Ctrl+K or `/`: Spotlight (ask Nexus or find an app). Clicking the avatar opens it too.
- ⌘/Ctrl+.: show the dock. ⌘/Ctrl+M: minimize the focused app. ⌘/Ctrl+Enter: fullscreen it. Esc: leave fullscreen.
- Drag a widget by any blank part of its card — drop on a free cell to move it, on an equal-size widget to swap. A drop that doesn't fit is refused (the orb says so); Esc cancels a drag mid-flight.
- Arrow keys on the avatar move it between resting spots.

## The avatar
The orb (`shell/avatar/orbitEngine.ts`) is the ORBIT engine ported into the shell: glyph-shaded shells rendered from the theme's accent/ink tokens, one motion preset per agent status plus `error`, and a radial dissolve after ~24s idle that melts it into the dot field (it wakes on status change, pointer-down or focus, and sleeps its rAF while dissolved). The dot field carries the matching "soul glow" at the avatar's anchor: breathing at idle, expanding ripples while working, one shockwave on error.

## IPC / API Contracts
Consumes Tauri commands exposed by `src-tauri/src/commands/`. See `src/types/ipc.ts`.

## Testing
Vitest + React Testing Library (jsdom), no globals:

```powershell
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run build     # vite build
```

- Test setup lives in `src/ui/testing/` (`setup.ts` installs the matchMedia and
  ResizeObserver/IntersectionObserver stubs and registers RTL cleanup; `a11y.ts`
  controls the reduced-motion/transparency/contrast preferences; `fixtures.tsx`
  has `renderWithProviders`).
- House style: explicit `import { describe, expect, it } from 'vitest'`; timer
  chains advance one `act()` per tick (React flushes effects at act exit).
- Pure logic (`wm/layout`, springs, command parsing, `wm/desktopStore`) is tested
  without DOM; components get RTL interaction/keyboard tests.
