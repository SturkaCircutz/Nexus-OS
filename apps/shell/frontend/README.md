# Shell Frontend (Presentation Shell)

## Purpose
React 19 desktop shell hosted inside Tauri. Renders the ASCII-styled desktop: a dot-field background, a 6×4 snap grid of app widgets, and floating glass chrome (menu bar, Spotlight, a dock that shows when needed, and the agent avatar). There are no window title bars; the agent and the grid manage layout. Light and dark modes come from CSS tokens. Product and design records: `PRODUCT.md`, `DESIGN.md`.

## Tech Stack
- React 19, TypeScript, plain CSS with tokens, Vite, MediaPipe Tasks Vision

## Folder Layout
```
apps/shell/frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx             # mounts <Desktop/>
│   ├── shell/               # Desktop (layers + global keys), WidgetGrid, AppHost, DotField
│   │   ├── InstanceHost.tsx # renders each app once and moves it between grid / fullscreen / minimized without remounting
│   │   ├── chrome/          # MenuBar, AnchorPicker, Spotlight (⌘K), Dock, FullscreenHost + chrome.css
│   │   ├── avatar/          # AgentAvatar (drag/flick), AgentBubble (replies), AvatarArt + frames (swap for real art)
│   │   └── agent/           # agentStore (status, reply, avatar anchor), parseCommand, runCommand, anchors
│   ├── wm/                  # layout.ts (grid packing), desktopStore.tsx (open/close/resize/minimize/fullscreen, saved to localStorage)
│   ├── apps/                # registry.ts: one AppDef per app (sizes, aliases, component)
│   ├── ui/                  # shared ASCII primitives (AsciiFrame, AsciiSpinner), motion/spring.ts + ui.css
│   ├── theme/               # tokens.css, ThemeProvider (light/dark/system), useReducedMotion
│   ├── hooks/               # useIPC, useGesture
│   ├── internal-apps/       # clock, notes, files, terminal, system-monitor (frontend + backend each)
│   ├── vision/              # MediaPipe landmark detection
│   └── types/               # WindowState, IPC schemas
├── README.md
```

## How to Run
```powershell
cd apps/shell/frontend
npm install
npm run dev
```

## How to Add a Feature
1. New internal app → build it in `src/internal-apps/<app>/frontend` (component takes `AppProps`: `size`, `mode`, `instanceId`), then add an entry to `src/apps/registry.ts`. The grid, Spotlight, dock and agent pick it up from there.
2. Shared ASCII piece (meter, list, spinner) → `src/ui/`, styled only with theme tokens so it works in light and dark. Animations use the springs in `src/ui/motion/spring.ts` and must handle reduced motion.
3. Desktop behavior (new layout action) → `src/wm/desktopStore.tsx`. Agent wording → `src/shell/agent/parseCommand.ts`, and what the command does → `src/shell/agent/runCommand.ts`.
4. Floating chrome (anything that sits above the grid) → `src/shell/chrome/`, using `.nx-glass`. Glass never sits on glass: popovers inside chrome use a solid `--surface`.
5. Hook → `src/hooks/`; type → `src/types/`.

## Keys
- ⌘/Ctrl+K or `/`: Spotlight (ask Nexus or find an app). Clicking the avatar opens it too.
- ⌘/Ctrl+.: show the dock. ⌘/Ctrl+M: minimize the focused app. ⌘/Ctrl+Enter: fullscreen it. Esc: leave fullscreen.
- Arrow keys on the avatar move it between resting spots.

## IPC / API Contracts
Consumes Tauri commands exposed by `src-tauri/src/commands/`. See `src/types/ipc.ts`.

## Testing

Run the frontend suite once:

```bash
npm run test:run
```

Use `npm test` for watch mode. The Search & Discover tests use Vitest, React Testing Library, JSDOM, and the generated search contracts.
