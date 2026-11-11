# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Demo audiences first:** judges, recruiters and showcase visitors meeting Nexus OS at UAIS club demos. They have seconds to understand that you talk to this desktop rather than manage it.
- **Then the team as daily users:** UAIS club members running Nexus OS on Windows all day. They need it calm, fast and predictable once the novelty wears off.

## Product Purpose
Nexus OS is an intent-driven desktop shell that runs on top of an existing OS. You say what you want ("show my notes", "make the clock small", "tidy up") and the agent arranges apps on a fixed grid for you. Success: people stop arranging windows by hand and stop switching between siloed tools.

## Positioning
The agent acts through validated tool calls on one shared `WindowState` contract that covers both internal widgets and real OS windows. It never clicks pixels through screen vision. The window manager is invisible: no title bars, no dragging, no resizing by hand.

## Operating Context
- A Tauri v2 webview on Windows, with the shell in React 19 + TypeScript. The browser dev build has no Tauri IPC, so system state there is local or mocked.
- A Python FastAPI engine (ReAct loop, tools, memory) will connect later. Until then a keyword parser stands in for the agent.
- Input is natural language first (typed now, voice later), then keyboard shortcuts, with hand gestures via MediaPipe planned.

## Capabilities and Constraints
- Fixed snap grid of 6 columns × 4 rows. Widget sizes are 1x1, 2x1, 1x2, 2x2 and 4x2, set by the system, never by dragging.
- App modes: widget, fullscreen, minimized.
- Light, dark and system theme.
- Layout persists locally for now. It moves to IPC `persist_workspace` / `get_desktop_state` later.
- An agent avatar sits at one of 7 anchors and reacts to agent and voice state.
- Undecided: per-app agent actions ("Kara Link") wait for the Automations orchestrator design. Real avatar art comes from the team lead later.

## Brand Commitments
- Name: Nexus OS (wordmark written `nexus` in the shell).
- ASCII is the product's motion language: widgets build in, move and leave as ASCII frames (from `apps/UI-Overview.md`).
- Calm, ambient desktop: "a space you rest in, not a control panel."

## Evidence on Hand
- `todoDoc.pdf` (repo root): the team's build list for the OS layout.
- `apps/UI-Overview.md`: the agreed main-screen principles.
- No real usage data, testimonials or benchmarks exist. Don't invent any.

## Product Principles
1. **Calm by default, striking on demand.** The resting screen is quiet; the moments a demo needs (summoning, the avatar, fullscreen) carry the craft.
2. **Ask first, keyboard always.** Every action can be asked for in words and also reached with the keyboard.
3. **Hidden window manager.** Users state intent; the system decides geometry.
4. **Never fake system state.** Show "offline" or "local" rather than invented health numbers.

## Accessibility & Inclusion
- Respect reduced motion, reduced transparency and increased contrast preferences.
- Full keyboard paths for every shell action; focus always returns where it came from.
- Agent replies are announced through a polite live region.
