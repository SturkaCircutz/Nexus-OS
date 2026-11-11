# Nexus OS — Main Screen UI Overview

## Feel
A calm, ambient desktop. Quiet, uncluttered. The screen should feel like a
space you rest in, not a control panel.

## Core Principles
1. **Light and dark modes** — soft, low-contrast base in both. *(proposal)* Follows
   the system setting by default, with a manual toggle.
2. **Hidden window manager** — users never see or touch window chrome. No title
   bars, no drag handles, no free-floating windows, no taskbar on the main screen.
3. **Coherent widgets** — every widget shares one visual style (same tokens for
   type, color, spacing, radius, borders). No widget brings its own look.
4. **ASCII as motion** — ASCII art is how widgets *move and appear*, not wallpaper.
5. **Design system** — tokens and component styling come from UI/UX Pro Max.

## Background: Interactive Dot Field
Inspired by Google Stitch: a dense, even grid of small dots covers the whole screen
behind the widgets.
- **Light mode:** light grey dots on the light background.
- **Dark mode:** dark grey dots on a near-black background.
- **Colors can change:** grey is the default. *(proposal)* The dot color is a theme
  token, so it can be tinted or set to a gradient across the screen (like Stitch's
  green-to-purple).
- **Hover:** dots near the cursor push away from it, like a magnet, then spring back
  into the grid when the cursor moves on. Subtle, within a small radius.
- *(proposal)* Dots are hidden under widgets; the push effect only plays on open
  background.
- *(proposal)* With reduced motion on, the dots stay still.
- *(proposal)* Replaces the faint per-cell dots used in the prototype.

## Layout: Fixed Grid
- Widgets snap to a fixed grid; position and size are set by the system, never by
  dragging/resizing.
- Cell: 160px, gap: 16px (from the current clock demo).
- Widget sizes: 1x1, 2x1, 2x2 (every widget must look right at each size it supports).
- *(proposal)* Grid is centered with generous outer margin to keep the calm feel.

## ASCII Animations (built into widgets)
- **Build-in:** the widget's frame draws itself corner to corner (`+---` → full box),
  then content types in, then the frame settles into the final clean border.
- **Move:** when widgets rearrange, they travel between cells with an ASCII motion.
- *(proposal)* **Remove:** build-in played in reverse (content erases, frame un-draws).
- *(proposal)* Animations are short (about a second; the prototype's build-in is
  ~1.3s) and respect a reduced-motion setting.

## Adding / Removing Widgets
- **Primary — ask the agent:** e.g. "show my notes", "hide the clock". The agent
  picks a free cell and the widget builds itself in.
- **Fallback — Spotlight:** ⌘/Ctrl+K (or `/`, or clicking the avatar) opens one
  input that both asks the agent and lists every app with its state, sizes and
  open/minimize/fullscreen actions. It replaced the earlier widget tray.
- The agent replies in a short bubble beside its avatar, not a chat window.

## Shell Chrome (Phase 2)
- **Menu bar:** one quiet glass line at the top: agent status, mic, engine, ask,
  theme, avatar position, clock.
- **Dock:** hidden until needed. It appears when an app is minimized, when the
  pointer reaches the bottom edge, or on ⌘/Ctrl+. — so the main screen still has
  no taskbar.
- **Fullscreen:** an app can grow out of its cell to fill the stage and return to
  the same cell (Esc).
- **Agent avatar:** an ASCII stand-in face that can be dragged or flicked to one of
  seven resting spots. At the center spot the grid dims to focus on the agent.
- Glass is only for this floating chrome; widgets stay flat.

## Widgets
Existing stubs, all following the shared style: Clock (built), Notes, Files,
Terminal, System Monitor.

## Open Questions for Team Lead
- ~~Is the agent prompt always visible, or summoned by a key?~~ Summoned (Spotlight).
- What happens when the grid is full?
- ~~Do any apps ever need a full-screen / focused view beyond the grid?~~ Yes, fullscreen.
- ~~Exact key shortcut for the widget tray.~~ ⌘/Ctrl+K (tray merged into Spotlight).
- Does "the colors can change" mean users pick the dot color, or that the dots shift
  color on their own (a gradient or slow drift)?
- Should widget cards also switch between light and dark surfaces? (Assumed yes.)
