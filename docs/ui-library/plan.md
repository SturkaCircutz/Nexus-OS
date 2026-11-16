# Baseline UI Library — Architecture & Implementation Plan

> Status: **Adopted & implemented through Phase 3** (Nov 2026). The §9 decisions were
> resolved as recommended: DESIGN.md "Quiet Terminal" stays (D-11), the library lives
> in `src/ui/` (D-1), plain CSS + tokens (D-2), ASCII glyphs (D-6), self-hosted fonts
> (D-7), per-instance error boundaries (D-8), RTL tests from day one (D-9).
>
> Landed: tokens v2, fonts, motion tokens, `ui/testing/` infra, the full L1–L2
> primitive set, L3 overlays, the L4 AI kit, the L4B media kit, L5 templates, the
> `WidgetPayload` type contract (§6.3), the timer widget as the first template app,
> and a 130+ test suite (Vitest + RTL, no globals).
>
> Still open (in dependency order): wire `engineClient` into `Desktop` per doc 07
> behind `NEXUS_ENGINE_URL` (the Phase-2 wiring half of D-10); rebuild Spotlight fully
> on the primitives with zero visual change; `VideoPlayer` / `ArticleReader` /
> `SearchResults` info widgets once the engine emits typed payloads; Settings /
> Assistant app templates; retire the `--nexus-*` token aliases (Phase 4).
>
> Original scope note: a reusable component/token/motion foundation for every future
> app, widget, overlay and system surface in the shell. It does **not** touch the
> Window Manager's placement logic, the engine, app backends, or the vision pipeline.

---

## 0. Executive summary

The shell already contains a strong, coherent design system ("The Quiet Terminal" in
`apps/shell/frontend/DESIGN.md`) and a set of high-quality primitives: theme tokens,
a spring motion engine, the `AsciiFrame` widget lifecycle, a FLIP-based instance host,
and glass chrome (MenuBar, Dock, Spotlight, avatar).

What is missing is the layer **between** those primitives and the apps: reusable
inputs, containers, overlays, AI-native components and templates. Today every widget
hand-rolls its own inputs, meters and text styles, which is exactly how visual drift
starts.

The product model is widget-first and browserless: every form of information —
images, video, articles, search results, agent output — arrives as a widget on the
grid. The plan therefore includes a shared **media/content kit** (§3.G) and a typed
widget-payload contract with the engine (§6.3) so info widgets stay consistent
without a browser.

This plan:

1. Audits what exists and what is dead legacy from the Phase-1 window-manager track.
2. Defines a layered UI library inside `apps/shell/frontend/src/ui/`.
3. Specifies the design system, motion system and Window-Manager integration contract.
4. Gives a phased roadmap with acceptance criteria.

The three decisions that need sign-off before implementation are in §9
(visual direction, legacy deletion, engine wiring).

---

## 1. Existing UI & architecture audit

### 1.1 What is actually live (verified in code)

`apps/shell/frontend/src/main.tsx` mounts `shell/Desktop.tsx`. The running desktop is
**not** what the root README or `docs/window-manager/plan.md` describe; those documents
are partially stale (see 1.4).

| Layer | Implementation | Files |
|---|---|---|
| Entry | `Desktop` = ThemeProvider → DesktopProvider → AgentProvider | `shell/Desktop.tsx` |
| Background | Canvas dot field, cursor-repulsion springs, rAF loop sleeps when settled | `shell/DotField.tsx` |
| Desktop store | External store via `useSyncExternalStore`; `AppInstance {id, appId, size, col, row, mode}`; commands return agent reply strings; localStorage persistence with validation + repack | `wm/desktopStore.tsx` |
| Grid | 6×4 grid, 160px cells, 16px gap, fit-scale (min 0.3), packing as pure functions | `wm/layout.ts`, `shell/WidgetGrid.tsx` |
| Instance rendering | Each app renders **once** into a stable detached `<div>`; grid slot / fullscreen / keepalive containers claim it via ref callbacks; spring-FLIP flights between them; focus restoration | `shell/InstanceHost.tsx`, `shell/hostNodes.ts` |
| ASCII motion | `AsciiFrame`: border draws corner-to-corner → content types in line-by-line → settles to a clean card border; exit reverses from the current timeline; move-flicker on cell change | `ui/AsciiFrame.tsx` |
| Motion engine | Spring physics (damping + response), interruptible, retargetable, writes straight to the DOM; `project()` for flings, `rubberband()` for edges | `ui/motion/spring.ts` |
| Chrome | Glass MenuBar (honest status words), conditional Dock, ⌘K Spotlight (combobox/listbox, focus trap, grows from origin), FullscreenHost with scrim, AnchorPicker popover | `shell/chrome/*` |
| Agent | 5-state store, keyword parser fallback (`parseCommand`/`runCommand`), reply bubble with typewriter + polite live region, draggable/flingable ASCII avatar (3×2 face, blink/spin/mouth frames) | `shell/agent/*`, `shell/avatar/*` |
| Engine contract | Typed REST+WS client with auto-ack of `ui.command` — **built and tested but not wired** (documented in `docs/AI-Core/07-api-flow.md` → "Wiring the shell") | `shell/agent/engineClient.ts`, `types/agentEvents.ts` |
| Apps | Registry-driven (`AppDef`: label, ASCII glyph, sizes, aliases, fullscreen, component). Clock is polished; notes/terminal/monitor/files are placeholders | `apps/registry.ts`, `internal-apps/*` |
| Theme | Semantic CSS custom properties, light/dark/system, no-flash paint, `data-theme` on `<html>` | `theme/tokens.css`, `theme/ThemeProvider.tsx` |
| Tests | Vitest: 4 files — snap math, session persistence, mock store invariants, engine client | `*.test.ts` |

### 1.2 Visual identity (as established by the project's own docs)

`apps/shell/frontend/DESIGN.md` is the authoritative, most specific spec —
**"The Quiet Terminal"**:

- Warm paper neutrals + one teal accent (`--accent`), mirrored for dark.
- Inter for prose, JetBrains Mono for labels, glyphs, keys and every ASCII frame.
- **ASCII is motion, not wallpaper**: things enter, move and leave through ASCII
  frames; clean borders at rest.
- Dot-field background (interactive), flat paper widgets, frosted glass only on
  floating chrome, glass never on glass.
- Hidden window manager: no title bars, no drag handles, no free windows.
- Spring motion, interruptible, same path in and out; reduced-motion honored.
- One-Accent rule (teal only marks focus/selection/agent-at-work; errors are ink + `x`).

`apps/UI-Overview.md` and `apps/shell/frontend/PRODUCT.md` agree with this direction.

**Tension with the original task brief:** the brief described a "Stark Industries"
sci-fi look with ASCII/code backgrounds and window title bars/controls/drag regions.
The project's own design system explicitly forbids those (ASCII-as-motion, no chrome,
no second hue). This plan follows the established documented system and satisfies the
sci-fi goals through the mechanisms already chosen: dot field, ASCII frames, agent
face, glyphs, mono typography. **This is open decision D-11 (§9).**

### 1.3 Problems, inconsistencies, technical debt

**Dead / legacy code from the Phase-1 WM track (superseded by the grid shell):**

- `App.tsx`, `components/` (WindowFrame with title bar + resize handles,
  WorkspaceCanvas, Taskbar, SnapPreview), `index.css` (dark `#0b0c10` + cyan `#66fcf1`
  theme that contradicts DESIGN.md).
- `wm/MockDesktopProvider.tsx`, `wm/mockDesktopStore.ts(+test)`, `wm/DesktopStoreAPI.ts`,
  `wm/DesktopStoreContext.tsx`, `wm/appRegistry.tsx`, `wm/snap.ts(+test)`,
  `wm/arrange.ts`, `wm/sessionPersistence.ts(+test)`.
- `types/WindowState.ts` imports `@nexus/window-state`, a workspace package that does
  not exist in the root `package.json` workspaces.
- Nothing is imported from any of the above by `main.tsx` — none of it is live.

**Two competing WM contracts in the tree:** legacy `DesktopStoreAPI` (window ids,
x/y, workspaces, monitors, free placement) vs. the live `desktopStore` (appId-keyed,
grid cells, three modes). Two app registries: `wm/appRegistry.tsx` vs. `apps/registry.ts`.

**Kept for later (not dead):** `modules/window-state/types.ts` (`WindowState` with
x/y/width/height, `isExternal`) is the cross-runtime contract for engine/Rust and
Phase-5 native windows. The shell simply no longer renders free-floating windows.

**Documentation gaps:**

- `docs/window-manager/plan.md` describes a 12×8 drag/resize/taskbar MVP; nothing
  marks it superseded by the grid shell.
- Root README still says "taskbar, window-snapping previews"; `docs/architecture.md`
  defers to it.
- `apps/shell/frontend/README.md` says "No test runner configured" — Vitest is
  configured with 4 test files.
- `apps/UI-Overview.md` credits the design system to "UI/UX Pro Max" (a tool
  artifact); `DESIGN.md` is the real spec.
- Nothing documents that `App.tsx`/`components/`/`index.css` are dead.

**Code-level debt:**

- Unused dependencies: `lucide-react`, `tailwindcss` (declared in
  `apps/shell/frontend/package.json`, zero usage in `src/`).
- Google Fonts loaded at runtime from the network (`index.css` `@import`) — conflicts
  with the air-gapped/local-first principle in `PRODUCT.md` and the AI-Core docs.
- Clock CSS uses legacy `--nexus-*` token names with cyan fallbacks (`#66fcf1`)
  that contradict the teal system (masked today by token aliases in `tokens.css`).
- Duplicate micro-logic: `useNow` in the clock app vs. `Clock` in MenuBar; ASCII bar
  meters hand-rolled in system-monitor instead of a shared primitive.
- No UI component tests (no `@testing-library/react`); no error boundaries anywhere;
  no dialog/toast/notification/tooltip/select primitives exist.
- Three uncoordinated motion systems coexist: CSS transitions (slots, colors), the
  spring engine (flights, avatar, Spotlight), RAF timelines (AsciiFrame, blink).
  Only the spring engine and AsciiFrame have documented specs.
- Agent vocabulary mismatch: the store has 5 states; the wire contract
  (`types/agentEvents.ts`, doc 07) has 7 (`acting`, `waiting` are missing in the UI).
  Doc 07 prescribes rendering them as `thinking` until real art exists.
- `src/ui/` is currently only 3 components + CSS; widgets hand-roll inputs, meters
  and panels — the inconsistency risk this library exists to remove.

### 1.4 Audit verdict

- **Retain as-is:** `tokens.css`, ThemeProvider, `spring.ts`, `AsciiFrame`,
  `AsciiSpinner`, `hostNodes`/`InstanceHost`, `desktopStore` + `layout.ts`,
  Spotlight/Dock/MenuBar/FullscreenHost patterns, `agentStore`/`engineClient`,
  registry `AppDef`/`AppProps`, Vitest setup.
- **Retire:** the legacy list in 1.3 (Phase 0).
- **Build:** the component layer between primitives and apps (Deliverable 3),
  plus an extracted reusable AI-visualization kit.

---

## 2. Proposed UI library architecture

### 2.1 Principles (derived from the codebase, not invented)

1. **One accent, characters first.** Teal marks focus/selection/agent-at-work only.
   Errors are ink + `x`. State is shown with glyphs before color.
2. **Two materials.** Paper widgets, glass chrome. Glass never on glass; popovers
   inside chrome are solid.
3. **ASCII is motion.** Enter/move/exit through frames; clean borders at rest.
   No ambient loops on resting elements.
4. **The system owns geometry.** Apps never drag, resize or position themselves.
   The library exposes *surfaces*, not window chrome.
5. **Springs, interruptible, same path in and out.** All travel uses the existing
   spring engine; exits reverse entries.
6. **Honest state.** Components show real status ("engine local", "mic off"),
   never invented data.
7. **Composition over configuration.** Small prop surfaces, `data-*` attributes for
   state styling, no variant explosions.

### 2.2 Layered architecture

```
┌────────────────────────────────────────────────────────────────┐
│ L5  TEMPLATES      AppTemplate · WidgetTemplate · AIAssistant  │
│                    Template · SettingsTemplate · DashboardTpl  │
├────────────────────────────────────────────────────────────────┤
│ L4  AI-NATIVE      AgentFace · AgentStatus · ActivityTimeline  │
│                    ToolCard · InterruptPanel · StreamingText   │
│                    PromptInput · AgentNodeGraph (later)        │
├────────────────────────────────────────────────────────────────┤
│ L4B MEDIA/CONTENT  MediaSurface · VideoPlayer · ArticleReader  │
│                    SearchResults · MediaStates · SourceBadge   │
├────────────────────────────────────────────────────────────────┤
│ L3  SYSTEM         AppShell · FullscreenSurface · Dock (wrap)  │
│                    Spotlight (wrap) · ToastHost · Dialog ·     │
│                    ContextMenu · EmptyState · ErrorBoundary    │
├────────────────────────────────────────────────────────────────┤
│ L2  COMPONENTS     Chip/Button · Input · Textarea · Switch ·   │
│                    Checkbox/Radio · Slider · Select/Popover ·  │
│                    Tabs · Collapsible · Meter · Badge · Kbd ·  │
│                    Tooltip · Divider · Typography              │
├────────────────────────────────────────────────────────────────┤
│ L1  ASCII/MOTION   AsciiFrame · AsciiSpinner · AsciiMeter ·    │
│                    AsciiGlyphs · AsciiFace · DotField ·        │
│                    spring engine · timing tokens               │
├────────────────────────────────────────────────────────────────┤
│ L0  FOUNDATIONS    tokens.css (v2) · typography · z-layers ·   │
│                    focus/a11y rules · reduced-motion contract  │
└────────────────────────────────────────────────────────────────┘
        ▲ consumes                      │ sits inside
        │                               ▼
┌────────────────────────────────────────────────────────────────┐
│ WM INTEGRATION SEAM (not part of the library)                  │
│ desktopStore · layout.ts · hostNodes/InstanceHost · registry   │
│ engineClient · agentStore                                      │
└────────────────────────────────────────────────────────────────┘
```

Dependency rule: L0 ← L1 ← L2 ← L3 ← L4 ← L5. Apps depend on L5 (templates) and
L2–L4 directly, never on `wm/` internals except through the integration hooks
(§6). Nothing in L0–L2 imports from `shell/` or `wm/`.

### 2.3 System boundaries

- **Window Manager** (`wm/`, `shell/hostNodes.ts`): placement, modes, focus,
  persistence, flights, keep-alive, fullscreen host. Untouched by the library.
- **UI library** (`src/ui/`): tokens, ASCII/motion primitives, components,
  templates, a11y contract. Knows nothing about how instances are placed; renders
  inside whatever box it is given.
- **Applications** (`internal-apps/*`): consume templates + components; own their
  data/state; receive `AppProps` and may use `useAppActions()` for
  agent-integrated requests (fullscreen/minimize/close) that route through the store.

---

## 3. Comprehensive component inventory

Priority key: **P0** foundation (blocks everything) · **P1** first app wave ·
**P2** second wave · **P3** deferred until justified.

Nexus has no browser and no free-floating windows: **every form of information is a
widget**. The library ships the shared media/content kit (§3.G) that info widgets
(image, video, article, search, …) are composed from; each info type is a small
internal app built with the templates and registered in `apps/registry.ts`.

### 3.A ASCII & motion primitives (L1)

| Component | Status | Purpose | Notes |
|---|---|---|---|
| `AsciiFrame` | exists, extend | Widget surface with enter/exit/move timeline | Add `variant: 'widget' \| 'panel' \| 'card'`; keep fluid mode; export `ENTER_MS` |
| `AsciiSpinner` | exists | 1-char loader (`\|/-\\`) | Keep |
| `AsciiMeter` | new (P1) — extract from system-monitor | `[####....] 42%` bar, label, value | Reduced-motion = still; basis of progress bars |
| `AsciiGlyphs` | new (P1) — codify | The icon system: `(:)` `[=]` `[/]` `[>]` `[#]` `>` `x` `↑↓↵esc` | Typed glyph map + `<Glyph name>`; replaces unused lucide dep |
| `AsciiFace` | new (P1) — extract from `shell/avatar/frames.ts` + `AvatarArt` | 3×2 state-driven face (idle/listening/thinking/acting/waiting/speaking/error) | Reusable in widgets, loading states, overlays; agent-visualization v1 |
| `AsciiNodeGraph` | new (P3) | Node/edge ASCII visualization for agent activity | Only after AgentFace + Timeline prove demand |
| `DotField` | exists, generalize | Background canvas field | Keep as-is; optional density/tint props later |
| spring engine | exists | `Springs`, `useSprings`, `MOVE/SHEET/FLING`, `project`, `rubberband` | Add timing tokens (§5); becomes *the* motion system |

### 3.B Core primitives (L2)

| Component | Status | Purpose |
|---|---|---|
| `Chip` / `Button` | exists as CSS, componentize (P0) | The pressable unit (`.chip`, `.nx-press`, pointer-down scale .97, pressed-invert, action/teal) |
| `IconButton` | new (P1) | Glyph-only chip |
| `TextInput`, `Textarea`, `SearchField` | new (P0) — extract from Spotlight field | Borderless Inter input after a teal `>` mark; SearchField = input + glyph + kbd hint |
| `Checkbox`, `Radio`, `Switch` | new (P1) | Character-marked state (`[x]`, `[ ]`, `>` selector) — chars before color |
| `Slider` | new (P2) | Only when a real use appears (volume, thresholds) |
| `Select` / `Popover` | new (P1) — extract from AnchorPicker | Solid-card popover, grow-from-origin, Esc/focus-return, typeahead |
| `Tooltip` | new (P2) | Delayed hint |
| `Badge` / `Tag` | new (P1) | Label chip variants |
| `Meter` / `ProgressBar` | new (P1) | Wraps `AsciiMeter` with `role="progressbar"` |
| `Divider` | new (P0) | The rule line (generalize `.nx-dock-rule`) |
| `Typography` | new (P0) | `Text`/`Mono`/`Label`/`Micro` mapping to DESIGN.md hierarchy |
| `Kbd` | exists as CSS, componentize (P0) | `<kbd>` styling incl. chrome variant |
| `Spinner` / `Loading` | exists (P0) | AsciiSpinner + labelled wrapper |

### 3.C Containers & layout (L2)

| Component | Status | Notes |
|---|---|---|
| `Panel` / `Card` | P1 | AsciiFrame surface without label, solid/popover |
| `Section` (labelled) | P1 | Mono label + rule header |
| `Stack`, `Grid` | P1 | Layout helpers over existing flex/grid |
| `ScrollArea` | P1 | Thin scrollbar tokens exist; add fade masks + keyboard scroll |
| `Tabs` | P1 | For fullscreen app layouts; roving tabindex |
| `Collapsible` | P2 | `v/>` glyph, height spring |
| `SplitPanel`, `Sidebar`, `Toolbar`, `Resizable` | P3 | Hidden-WM philosophy: no resizable surfaces yet |

### 3.D Window/desktop integration (L3) — no duplication of WM

| Component | Status | Relationship to WM |
|---|---|---|
| `AppShell` | new (P0) — formalizes `AsciiFrame`+`AppHost`+focus | The per-instance surface apps render into. The shell owns it (InstanceHost); the library provides the contract |
| `FullscreenSurface` | exists (FullscreenHost) | WM hosts; library provides the scrim + esc-back chip pattern |
| `Dock` | exists | Shell-owned; library needs only its Chip + hint primitives |
| `Spotlight` | exists | Shell-owned command palette; the reference for palette-type surfaces |
| `Dialog` / `Modal` | new (P1) | From Spotlight mechanics: scrim, focus trap, same-path exit, `role="dialog"` |
| `ContextMenu` | new (P2) | Popover at pointer, keyboard navigable |
| `Toast` / `Notification` | new (P1) | Generalize AgentBubble: auto-dismiss + hold-on-hover + live region, stacked below the menu bar |
| `EmptyState` | new (P1) | `nothing here yet` pattern (exists in Spotlight) |
| `ErrorBoundary` | new (P0) | Per-instance so one app crashing doesn't kill the desktop; renders `x` glyph + mono message |
| `ConfirmPanel` | new (P1) | The engine `run.interrupt` (confirm/clarify) surface |

**Deliberately excluded** (per DESIGN.md and the hidden-WM product decision):
title bars, window controls, drag/resize handles, taskbar, snap previews,
free-floating windows.

### 3.E AI-native (L4)

Grounded in the existing wire contract (`types/agentEvents.ts`, doc 07).

| Component | Status | Grounding |
|---|---|---|
| `AgentStatusIndicator` | new (P1) — extract from MenuBar status | Spinner + status word; teal while working |
| `AgentFace` | new (P1) | As above; supports all 7 wire states (acting/waiting → thinking art until real art lands, per doc 07) |
| `StreamingText` | new (P1) — extract from AgentBubble | Typewriter at final size, hold-on-hover, polite live region, error variant |
| `PromptInput` | new (P1) | Spotlight field + submit; used by Spotlight and future assistant surfaces |
| `ActivityTimeline` | new (P2) | Renders `task.progress` events (queued/running/done/failed/skipped) as mono task lines with glyphs |
| `ToolExecutionCard` | new (P2) | One tool call: name, args summary, status glyph, ack state |
| `InterruptPanel` | new (P1) | confirm/clarify options → POST resume; prefill original text for clarify (open decision in doc 07) |
| `AgentRunPanel` | new (P3) | Timeline + tool cards for one run |
| `AgentNodeGraph` | new (P3) | See L1 |

### 3.F Data visualization (L2.5)

| Component | Status |
|---|---|
| `AsciiMeter` | P1 (extracted) |
| `Sparkline` (ASCII drift bars) | P2 — standardize when a real data source lands |
| `Timeline` | P2 (shared with ActivityTimeline) |
| `DataTable` | P3 |
| `StatusDashboard` | P3 (composition of meters, not a new component) |

### 3.G Media & content surfaces (L4B)

The shell has no browser and shows everything as widgets. The library does not ship
one-off "image widget" / "video widget" components; it ships the **content-surface
kit** that those internal apps are composed from, so every info widget behaves
identically.

| Component | Status | Purpose |
|---|---|---|
| `MediaSurface` | new (P1) | Places any media into a fixed grid cell: `fit: 'cover' \| 'contain'`, letterbox on `--surface` with the dot texture, caption slot, SourceBadge slot, fullscreen hook |
| `VideoPlayer` | new (P2) | HTML5 `<video>` inside the WebView2 shell with ASCII controls: play/pause glyph, AsciiMeter scrubber, mono timecode; no autoplay, poster frame, volume via the P2 Slider |
| `ArticleReader` | new (P2) | Readable typographic view of `fetch_article` output (headings / paragraphs / lists) in the Text/Bubble scale, evidence-ref markers (C9), fullscreen-native |
| `SearchResults` | new (P2) | Ranked result rows (glyph + title + source meta) from `search_web`; opens ArticleReader in fullscreen |
| `SourceBadge` | new (P1) | Attribution/citation chip: domain or evidence ref, mono Label |
| `MediaStates` | new (P1) | Loading (mono skeleton + AsciiSpinner), error (`x` + retry chip), empty — every media surface uses these |
| `useMediaLifecycle` | new (P1) | Lazy decode via IntersectionObserver; **pauses video and releases large media when the instance is minimized or offscreen** (keep-alive divs stay mounted, so media must sleep) |

Info widgets built from this kit (each a small internal app using the templates):
`image`, `video`, `article`, `search` — then later `gallery`, `table`, `map`, `code`.

Sizing & consistency rules:

- Media must look right at every size it supports (1x1 / 2x1 / 1x2 / 2x2 / 4x2):
  `cover` crops, `contain` letterboxes on `--surface` with the dot texture.
- Captions wrap in Bubble text; the frame stays the standard widget surface
  (paper, never glass); controls are mono glyphs, not icon fonts.
- Remote media is fetched through the engine (`fetch_article`, media renderers) and
  always attributed with SourceBadge; direct remote image loading additionally needs
  a CSP / allow-list decision in `src-tauri/tauri.conf.json` (open decision D-13).
- Opening a result deepens the surface: row → fullscreen ArticleReader, image →
  fullscreen view — same-path exit back to the widget.

### 3.H Templates (L5)

| Template | Status | Purpose |
|---|---|---|
| `WidgetTemplate` | P1 | Sizes (1x1/2x1/1x2/2x2/4x2) → content mapping, label slot, empty state, per-size density |
| `AppTemplate` (fullscreen) | P1 | Header row (label + actions — content, not window chrome), tabs/content, Esc contract |
| `AssistantTemplate` | P2 | Prompt + streaming replies + activity timeline in one surface |
| `SettingsTemplate` | P2 | Sections + rows (label / control / hint) |
| `DashboardTemplate` | P3 | Grid of Panels + meters |

---

## 4. Design system specification

### 4.1 Token architecture (v2 of `tokens.css`)

Keep the existing flat, semantic, two-theme custom-property system. Formalize
naming into families so apps never invent values:

```
Colors (both themes)        --bg --surface --surface-raised --ink --muted
                            --line --dot --accent --accent-soft
                            --glass --glass-edge --glass-blur --scrim
Status (added)              --ok --warn (proposals; error stays ink+x per the One-Accent rule)
Elevation                   --shadow --shadow-float
                            (Card / Float / Bar / Popover shadow vocabulary from DESIGN.md)
Shape                       --radius-key 4 --radius-chip 6 --radius-row 8 --radius-card 12
                            --radius-bubble 14 --radius-sheet 16 --radius-avatar 20 --radius-pill 999
Spacing                     --s-xs 4 --s-sm 8 --s-md 12 --s-lg 16 --s-card 18 --s-gap 16 --s-stage 24
Grid                        --cell 160 --grid-gap 16 --cols 6 --rows 4
                            --chrome-top 40 --chrome-bottom 72
Type                        --sans --mono --fs-body 14 --fs-input 16 --fs-bubble 13 --fs-mono 12
                            --fs-label 11 --fs-micro 10 --fs-frame 13/16 --fs-face 20/22
Motion                      --dur-fast 100 --dur 150 --dur-slow 300 --dur-draw 540 --dur-fill 450
                            --dur-settle 280 --dur-pop 160 --dur-fade 180
                            --ease cubic-bezier(0.2, 0.7, 0.2, 1)
                            (spring configs live in spring.ts: MOVE SHEET FLING)
Z-layers                    --z-dots 0 --z-stage 1 --z-fullscreen 20 --z-flight 25
                            --z-menubar 30 --z-dock 35 --z-agent 40 --z-spotlight 50
                            (currently local to shell.css; promote to tokens)
Legacy                      --nexus-* aliases (keep one release, then delete after apps migrate)
```

Rules:

- Components may only reference tokens (no raw hex/px outside `tokens.css`/`spring.ts`).
- New visual values require a token first; theme drift is impossible because
  `data-theme` swaps only the color block.

### 4.2 Typography

Exactly DESIGN.md's hierarchy, componentized:

- `Text` — Inter 400, 14/1.5 (prose)
- `InputLabel` — Inter 400, 16/1.4 (the Spotlight-field rule; 16px avoids zoom)
- `Bubble` — Inter 400, 13/1.45 (replies)
- `Mono` — JetBrains Mono 400, 12/1.7 tabular (data blocks, terminal, glyphs)
- `Label` — JetBrains Mono 400, 11, 0.04em (frame labels, chips, menu bar)
- `Micro` — JetBrains Mono 400, 10 (group names, keys)
- `Frame` — JetBrains Mono 13/16px (the ASCII border grid, fixed so characters
  land on card edges)
- `Face` — JetBrains Mono 600, 20/22px (the avatar's 3×2 face)

**Fonts must be self-hosted woff2** (JetBrains Mono, Inter). Removing the Google
Fonts network call is required by the local-first constraint.

### 4.3 Surface language

- **Widget surface** = `--surface` + 1px `--line` + `--radius-card` + Card shadow;
  flat, never glass.
- **Chrome surface** = `.nx-glass` — only MenuBar/Dock/Spotlight/avatar/bubble/toasts.
- **Popover surface** = solid `--surface`, Popover shadow, inside chrome.
  Glass never stacks.
- **Focus** = 2px `--accent` ring, 2–3px offset (the global `:focus-visible` rule).
- **Hover** = `--bg` fill on paper, ink@7% on glass; press = scale .97 on
  pointer-down.
- **ASCII overlay** = mono 13/16 in `--muted`, stretched so the character grid lands
  exactly on edges (AsciiFrame's existing technique — the library's signature).

---

## 5. Animation & motion specification

One system, three techniques, one spec:

| Technique | Used for | Interruptible | Existing code |
|---|---|---|---|
| Springs (`spring.ts`) | Travel (flights, avatar, dock), sheets (Spotlight), retargeting | Yes — from current value+velocity | `Springs`, `useSprings`, `MOVE/SHEET/FLING` |
| RAF timeline | Frame-sequenced ASCII (draw→type→settle), blink, spin | Yes — rewinds from `t` | `AsciiFrame`, `AvatarArt`, `AgentBubble` |
| CSS transitions | Colors, opacity, slot transforms, caret | No (non-positional) | tokens `--dur*`, `.nx-slot` |

**Named motion vocabulary (specs to enforce):**

- **Build-in** (widget enter): draw 540ms → fill 450ms → settle 280ms; label types
  in during fill; surface fades in at settle. Exit = reverse at 1.7× from current
  progress. (exists)
- **Move-flicker** (cell/size change): 480ms border flicker + pulse while the slot
  transitions. (exists)
- **Travel** (fullscreen/dock flights): FLIP with the `MOVE` spring, velocity
  handoff, dock-chip retargeting, focus restoration. (exists in `hostNodes`)
- **Same-Path**: every exit reverses its entry and returns focus to the opener.
  (exists — Spotlight, dock, avatar)
- **Press**: scale .97 starting on pointer-down, ≤100ms. (exists)
- **Blink/spin** (agent): irregular 4–7s blinks, 110ms frames; stops the instant the
  state changes. No breathing/idle loops on resting elements. (exists)
- **Typewriter** (replies): 18–22ms/char at final size, hold on hover, 6s stay.
  (exists)

**New standardized timings** (tokens, not one-offs): pop 160ms (picker precedent) →
`--dur-pop`; fade 180ms (reduced-motion stand-in) → `--dur-fade`; toast dismiss 300ms.

**Reduced-motion contract (formalize what partially exists):** skip the ASCII build
(show settled), fade/jump instead of travel, stop blink/spin (still frame + label),
stop DotField interaction, `prefers-reduced-transparency` → solid glass fallback,
`prefers-contrast: more` → ink borders. Every new component must implement all of
these — a PR checklist item, backed by a test helper in `ui/testing/a11y.ts`.

**Lifecycle rules:** every animation returns a cancel function (existing pattern);
flights/steps must not outlive their component (`useSprings` already stops on
unmount); store-driven removal happens only after `onExited` (the existing
`exiting` flag). No new global animation loops.

---

## 6. Window Manager integration specification

The seam already exists and works. The library's job is to **name it and guard it**,
not rebuild it.

### 6.1 Responsibilities

| Concern | Owner |
|---|---|
| Open/close/resize (by size)/minimize/restore/fullscreen/tidy, focus, packing, persistence | **WM** (`desktopStore`, `layout.ts`) |
| Instance lifecycle: one stable div per app, container claiming, FLIP flights, focus rescue | **WM** (`InstanceHost`, `hostNodes`) |
| Surface rendering, ASCII motion, content layout inside the box | **UI library** (`AsciiFrame`, templates) |
| App data, interaction, internal state | **App** |
| Agent status/replies, engine connection, `ui.command` mapping | **Agent layer** (`agentStore`, `engineClient`) |

### 6.2 Contracts

**App contract (exists — keep verbatim):** every app receives
`AppProps { instanceId, size, mode }` and is registered in `apps/registry.ts` with
`{label, glyph, sizes, defaultSize, aliases, fullscreen, component}`.

**New hook the library exposes (thin, additive):**

```ts
// @/ui — wraps useDesktop so apps never import wm/ directly
export function useAppActions(appId: string): {
  requestFullscreen(): void   // no-op + agent says so when !app.fullscreen
  requestMinimize(): void
  requestClose(): void        // with a confirmation affordance where needed
}
```

**Focus propagation:** pointer-down/focus on `.nx-instance-inner` →
`store.focus(id)` (exists); Spotlight/dock restore via `focusTarget(id)` (exists).
Components never steal focus on mount except via explicit `focusTarget`.

**Keyboard shortcuts:** desktop-level keys stay in `Desktop.tsx`'s one handler;
overlays stopPropagation when they consume a key (Spotlight/dock precedent). Apps
register nothing globally — an app-local `useHotkeys` scoped to its instance div is
the only allowed pattern (P2, when first needed).

**Modality:** the stage goes `inert` while Spotlight is open (exists). Generalize:
an overlay host marks the stage inert while any modal Dialog/InterruptPanel is open;
glass-never-on-glass is enforced by a documented rule.

**Stacking:** only the z-token ladder from §4.1 — flights may lift above slots
(z=5, the existing hack in `flip()`), chrome tokens unchanged.

**Engine → WM path (when `engineClient` is wired; spec already in doc 07
"Wiring the shell"):**

- `onUiCommand` maps `open_app / close_app / focus / move / resize / minimize /
  maximize / restore / snap / set_avatar_position` to store calls.
- Ack with `{ok, wmState}` built from `store.getState()` mapped to
  `WmState {apps:[{app_id, mode}], focused_app_id}`.
- `pushWmState()` on `store.subscribe`.
- The UI library contributes only the components that *display* run/interrupt/task
  state (§3.E).

**Persistence:** `save()` in the store, later swapped for
`persist_workspace` / `get_desktop_state` IPC as documented in the
`desktopStore.tsx` header comments. The library never touches persistence.

### 6.3 Widget payload contract (engine-side work item)

`run.response.widgets` exists on the wire but is typed `Record<string, unknown>` and
always `[]` today (doc 07, known limits: "widgets is [] until tools produce them").
Info widgets need typed payloads, mirrored like the rest of the contract
(`types/agentEvents.ts` ↔ `api/events.py`, changed in one PR):

```ts
type WidgetPayload =
  | { kind: 'image'; src: string; alt: string; source?: string }
  | { kind: 'video'; src: string; poster?: string; source?: string }
  | { kind: 'article'; title: string; blocks: ArticleBlock[]; evidenceRefs: string[] }
  | { kind: 'search'; query: string; results: Array<{ title: string; url: string; snippet: string; source: string }> }
```

Flow: the engine emits a payload from `fetch_article` / `search_web` / media
renderers → the shell opens the matching info widget on the grid (or renders it in
the run panel) → the payload is displayed through the §3.G kit. The discriminated
union lives in `types/agentEvents.ts` (shell) and `schemas/contracts.py` (engine).
This is the piece that makes "all information arrives as a widget" real instead of
ad-hoc.

---

## 7. Recommended project structure

Evolve the existing `src/ui/` in place (imports `@/ui` already exist — no path
churn), with a strict public barrel:

```
apps/shell/frontend/src/ui/
├── index.ts                    # the ONLY public API (barrel)
├── README.md                   # how to consume, contribution rules, PR checklist
├── tokens/
│   ├── tokens.css              # L0 (moved from theme/, re-exported by theme/)
│   └── motion.ts               # timing/spring constants
├── motion/                     # L1
│   ├── spring.ts               # (exists)
│   └── timeline.ts             # extract the AsciiFrame animate() helper
├── ascii/                      # L1
│   ├── AsciiFrame.tsx          # (exists)
│   ├── AsciiSpinner.tsx        # (exists)
│   ├── AsciiMeter.tsx          # new
│   ├── Glyph.tsx + glyphs.ts   # the icon system
│   ├── AsciiFace.tsx           # extracted from shell/avatar/frames.ts + AvatarArt
│   └── ascii.css
├── components/                 # L2
│   ├── Button.tsx  Input.tsx  Textarea.tsx  Switch.tsx  Checkbox.tsx
│   ├── Radio.tsx   Popover.tsx Select.tsx Tooltip.tsx Tabs.tsx
│   ├── Meter.tsx   Badge.tsx  Divider.tsx  Text.tsx Kbd.tsx
│   ├── Panel.tsx   Section.tsx Stack.tsx ScrollArea.tsx Collapsible.tsx
│   └── components.css
├── overlays/                   # L3
│   ├── Dialog.tsx Toast.tsx (ToastHost) ContextMenu.tsx
│   ├── EmptyState.tsx ErrorBoundary.tsx ConfirmPanel.tsx
│   └── overlays.css
├── ai/                         # L4
│   ├── AgentStatus.tsx  StreamingText.tsx  PromptInput.tsx
│   ├── ActivityTimeline.tsx  ToolCard.tsx  InterruptPanel.tsx
│   └── ai.css
├── templates/                  # L5
│   ├── WidgetTemplate.tsx AppTemplate.tsx SettingsTemplate.tsx
│   ├── AssistantTemplate.tsx
│   └── templates.css
└── testing/
    ├── a11y.ts                 # reduced-motion/transparency/contrast test helpers
    └── fixtures.tsx            # providers wrapper for RTL
```

Consumption rule: apps import from `@/ui` only. `theme/`, `hooks/`, `types/` stay
where they are (cross-cutting, referenced by docs). Internal `shell/chrome` may use
the library; the library may never import `shell/`.

**Phase-0 cleanup (separate, mechanical, first PR):** delete/quarantine `App.tsx`,
`components/`, `index.css`, `wm/MockDesktopProvider.tsx`, `mockDesktopStore.ts(+test)`,
`DesktopStoreAPI.ts`, `DesktopStoreContext.tsx`, `wm/appRegistry.tsx`,
`wm/snap.ts(+test)` (move snap-math tests under `layout.ts`), `wm/arrange.ts`,
`sessionPersistence.ts(+test)`, the `types/WindowState.ts` re-export; drop
`lucide-react` and `tailwindcss` from `package.json`; mark
`docs/window-manager/plan.md` as superseded with a header note.

---

## 8. Implementation roadmap

### Phase 0 — Cleanup & foundations (1 session)

Do: legacy deletion, dependency removal, tokens v2 (§4.1), self-hosted fonts,
promote z-layers, motion tokens, `ui/testing/` helpers, RTL + jsdom dev deps,
`ui/README.md`, barrel reorganization without API changes.

Accept: `npm run build` + `vitest` green; the running desktop is pixel-identical
(this phase changes no visuals); no app imports raw values.

### Phase 1 — Primitives + AppShell contract (1–2 sessions)

Do: Button/Chip/IconButton, Text/Label/Mono/Kbd/Divider/Badge, Input/Textarea/
SearchField, Switch/Checkbox/Radio, Popover (+Select), Meter/AsciiMeter, Glyph,
AsciiFace extraction, Dialog, Toast + Host, ErrorBoundary (mounted per instance in
InstanceHost), EmptyState, `useAppActions`.

Accept: Spotlight rebuilt *on* the new primitives with zero visual change (the
proof of the library); keyboard-only pass of every primitive; a11y test suite passes.

### Phase 2 — AI-native kit (1–2 sessions)

Do: AgentStatus (wire states incl. acting/waiting), StreamingText, PromptInput,
ActivityTimeline + ToolCard fed by `task.progress`/run events, InterruptPanel
(confirm/clarify → resume), wire `engineClient` into `Desktop` per doc 07 behind a
`NEXUS_ENGINE_URL` env with the parser as offline fallback.

Accept: with the engine running, a run shows live state on the avatar; a confirm
interrupt renders InterruptPanel and resumes; every UI surface has reduced-motion
and offline fallbacks.

### Phase 3 — Templates, media kit & first real apps (2–3 sessions)

Do: WidgetTemplate + AppTemplate; rebuild system-monitor on AsciiMeter + shared
data hooks (real IPC `system_diagnostics` when available); tabs in a fullscreen app;
Toast adoption for engine errors; ContextMenu if justified.

Do (media/content kit): MediaSurface + MediaStates + SourceBadge +
useMediaLifecycle; the image and article widgets as the first info apps (fed by
`search_web` / `fetch_article` once the engine emits typed widget payloads, §6.3);
VideoPlayer + SearchResults second.

Accept: a new widget can be added by writing one component + one registry entry,
using only `@/ui` imports — the acceptance test for the whole library. An image and
an article open from agent results, captioned and attributed, sized correctly at
every supported grid size, and sleep while minimized.

### Phase 4 — Polish, docs, test depth (ongoing)

Do: component/interaction tests across all primitives, Playwright visual snapshots
(optional), React Profiler pass, doc updates (shell README; DESIGN.md appendices:
tokens reference + motion spec), retire `--nexus-*` aliases.

Accept: CI runs `tsc --noEmit`, `vitest`, and the build; every component is
documented on one page.

### Deferred until demanded (P3)

Slider, ContextMenu, DataTable, AgentNodeGraph, Sparkline, SplitPanel,
DashboardTemplate, AgentRunPanel, and the second-wave info widgets (gallery, table,
map, code).

---

## 9. Technical decisions (open for sign-off)

| # | Decision | Options | Recommendation & why |
|---|---|---|---|
| D-1 | Library location | a) `src/ui/` in-shell b) npm workspace package | **a.** Only one consumer exists today; workspace packaging adds tooling for zero reuse. Revisit when a second shell appears. |
| D-2 | Styling | a) plain CSS + tokens (current) b) CSS Modules c) Tailwind (unused dep) d) CSS-in-JS | **a**, with strict prefixes + per-component files. Matches everything existing, zero runtime, tokens theme perfectly. Add CSS Modules only if collisions bite. Remove Tailwind/lucide. |
| D-3 | Motion ownership | a) springs only b) keep 3 techniques c) WAAPI everywhere | **b** — formalize the three-technique split (§5). Springs can't do the ASCII draw timeline; CSS can't do interruptible travel. |
| D-4 | State | a) keep external stores b) add zustand c) contexts everywhere | **a.** `useSyncExternalStore` stores are tested and lean; contexts would re-render the whole desktop. No new deps. |
| D-5 | Agent states | a) keep 5 b) adopt 7 wire states | **b** — adopt `acting`/`waiting` in the store, render as thinking art until real frames exist (doc 07 prescribes this). |
| D-6 | Icons | a) lucide b) SVG set c) ASCII glyph system | **c** — `[=]` `(:)` `>` `x` is the established language; a typed `Glyph` map. DESIGN.md forbids drift. |
| D-7 | Fonts | a) keep Google Fonts b) self-host | **b** — local-first/air-gap requirement; also fixes font flash in the webview. |
| D-8 | Error handling | a) global boundary b) per-instance boundaries | **b** — one app must not take down the desktop; ErrorBoundary per instance in InstanceHost. |
| D-9 | Component tests | a) RTL now b) defer | **a** — small addition (`@testing-library/react` + jsdom); primitives are cheap to test; keep pure-logic tests in Vitest as today. |
| D-10 | Wire the engine now? | a) in the UI-library effort b) separate track | **a, in Phase 2** — the AI-native components are meaningless against the keyword parser; `engineClient` is built and tested; wiring is ~1 session. |
| D-11 | **Visual direction** | a) follow DESIGN.md "Quiet Terminal" (paper/teal/dot-field, ASCII-as-motion) b) pivot to a darker sci-fi terminal aesthetic | **a** — it is implemented, documented and coherent; the sci-fi goals are met by dot field + ASCII frames + agent face + mono everywhere. A pivot now would discard the entire implemented shell. **Needs explicit confirmation.** |
| D-12 | Window chrome for apps | a) provide title bars/controls b) hidden-WM surfaces only | **b** — DESIGN.md forbids chrome; "window shell/title bar/controls" are satisfied by AppShell + FullscreenSurface + WM. An app-internal toolbar is app content, not window chrome. |
| D-13 | Remote media path | a) engine-proxied/normalized content (local-first, attribution built-in) b) direct remote URLs with a CSP allow-list in `tauri.conf.json` | **a** for fetched content (articles, search results, media renderers), **b** acceptable for user-pinned images later. Decide per widget kind when payloads are typed (§6.3). |

---

## 10. Testing & validation strategy

- **Pure logic (existing pattern):** Vitest unit tests for layout/spring/parse math —
  numbers in, numbers out, no DOM.
- **Component tests (new):** `@testing-library/react` + jsdom for interaction
  (keyboard, focus, pressed states), with the providers fixture from `ui/testing/`.
- **A11y tests (new):** a helper asserting each component honors
  reduced-motion / reduced-transparency / increased-contrast, plus manual
  keyboard-only passes; axe-core optional.
- **WM integration:** store-level tests (existing mock-store checklist pattern:
  open→focus→minimize→restore→close; hydrate round-trip). Flights stay visual-only;
  validated by manual pass + optional Playwright screenshots later.
- **Performance:** React Profiler pass per phase; the DotField/spring rAF loops must
  sleep when idle (already true); benchmark scripts live under `tests/bench/`.
- **Theme consistency:** every component test renders in both themes; a shared
  fixture asserts token-only styling (no raw values) by convention/review.
- **Media performance:** video pauses and large media is released when the instance
  is minimized or offscreen (asserted against the keep-alive state); lazy decode is
  verified with mocked IntersectionObservers; `MediaStates` covers loading, error
  and empty for every media surface.

---

## 11. Final implementation blueprint (session-ready)

1. **PR-0 (mechanical):** legacy purge + dependency removal + doc headers marking
   superseded plans. Zero visual change.
2. **PR-1 (foundations):** tokens v2 + self-hosted fonts + motion/timing tokens +
   z-ladder promotion + `ui/` restructure with barrel + RTL setup + `ui/README.md`
   (contribution rules: token-only values, reduced-motion checklist, same-path rule,
   no glass-on-glass, glyphs before color).
3. **PR-2..n (primitives):** build in the P0→P1 order of §3, each with: component +
   CSS (token-only) + RTL tests (interaction + keyboard) + reduced-motion suite +
   one usage in an existing shell surface to prove fit (Spotlight-first).
4. **PR (AI kit):** extract AgentFace/StreamingText/AgentStatus; add
   Timeline/ToolCard/InterruptPanel; wire `engineClient` with env-gated fallback to
   `parseCommand`.
5. **PR (templates):** WidgetTemplate + AppTemplate; port system-monitor onto
   AsciiMeter; add per-instance ErrorBoundary.
6. **Standing acceptance test for every phase:** the running desktop's look and
   behavior is unchanged except where intentionally improved; keyboard-only
   operation still covers 100% of actions; and adding a hypothetical new app
   requires only a registry entry + composition of `@/ui` exports.

**Explicitly out of scope of the library:** window placement, engine policy, app
backends, the vision/gesture pipeline, native Win32 surfaces (Phase 5 uses
`modules/window-state` unchanged — the library grows external-window surfaces only
when that phase lands).
