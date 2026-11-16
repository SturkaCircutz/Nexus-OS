---
name: Nexus OS Shell
description: A calm paper desktop where ASCII is the motion language and the agent arranges everything.
colors:
  paper: "#f5f4f0"
  card: "#fdfcfa"
  ink: "#26261f"
  pencil: "#6b685f"
  rule: "#dcd8ce"
  dot: "#cfcbc1"
  teal: "#2f6b62"
  teal-soft: "rgba(47, 107, 98, 0.1)"
  night: "#0f0f0e"
  night-card: "#181816"
  night-ink: "#e8e6df"
  night-pencil: "#9b988f"
  night-rule: "#2e2d29"
  night-dot: "#3a3935"
  night-teal: "#74b8ad"
  night-teal-soft: "rgba(116, 184, 173, 0.14)"
typography:
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  input:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  bubble:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.04em"
  micro:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.06em"
  frame:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "16px"
  face:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "22px"
rounded:
  key: "4px"
  chip: "6px"
  row: "8px"
  card: "12px"
  bubble: "14px"
  sheet: "16px"
  avatar: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  card: "18px"
  gap: "16px"
  stage: "24px"
components:
  chip:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 8px"
    height: "30px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.chip}"
  chip-action:
    textColor: "{colors.teal}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
  widget-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "38px 18px 16px"
  menubar-button:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "0 8px"
    height: "24px"
  dock-chip:
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  spotlight-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.row}"
    padding: "0 12px"
    height: "38px"
  spotlight-row-selected:
    backgroundColor: "{colors.teal-soft}"
  agent-avatar:
    textColor: "{colors.ink}"
    typography: "{typography.face}"
    rounded: "{rounded.avatar}"
    size: "72px"
  agent-bubble:
    textColor: "{colors.ink}"
    typography: "{typography.bubble}"
    rounded: "{rounded.bubble}"
    padding: "10px 14px"
---

# Design System: Nexus OS Shell

## Overview

**Creative North Star: "The Quiet Terminal"**

Nexus OS is a desk of warm paper with a faint dot grid, and on it sit a few cards the agent placed for you. Nothing on the desk is decoration. ASCII is how things move and how things are marked: a card draws its border corner to corner, types its content in, then settles into a clean edge; apps are named by small bracket glyphs like `[=]`; the agent's face is two lines of characters. At rest the screen should almost disappear.

The shell has two materials. Widgets are flat paper cards. The chrome that floats above them (menu bar, dock, Spotlight, the avatar and its bubble) is light frosted glass, so the dot field shows through softly and you can tell at once what is content and what is the system. A popover that opens inside glass is solid paper, never more glass.

Motion follows Apple's interaction model. Every press responds on pointer-down. Travel uses springs described by damping and response; they start from wherever a thing is now, keep its velocity when interrupted, and things leave along the path they came in. With reduced motion, travel becomes a short fade or a jump, and the ASCII build is skipped.

**Key Characteristics:**
- Warm paper neutrals with one teal accent, mirrored for dark mode
- Inter for reading, JetBrains Mono for labels, keys, glyphs and every ASCII frame
- Fixed 6×4 grid of 160px cells; the system picks geometry, never the user
- ASCII frames for enter, move and exit; clean borders at rest
- Glass only on floating chrome; solid under reduced transparency or high contrast
- Springs (damping + response), interruptible, symmetric paths

## Colors

Neutrals carry nearly everything. Teal appears only where something is focused, selected, or the agent is working.

### Primary
- **Teal** (light / night pair): focus rings, the Spotlight `>` prompt mark, the selected Spotlight row's glyph, the chosen anchor in the picker, the agent's status text and avatar edge while it listens, thinks or speaks. Text, rings and edges only.
- **Teal Soft**: the 10–14% teal wash behind a selected Spotlight row or the checked anchor cell. The only teal fill in the system.

### Neutral
- **Paper**: the desk, and the hover fill on chips.
- **Card**: widget surfaces, solid popovers, and the glass fallback.
- **Ink**: body text, pressed chips, the clock, the error bubble's edge, the high-contrast glass border.
- **Pencil**: labels, hints, keys, menu bar status, dock glyphs, ASCII strokes.
- **Rule**: card, chip, glass and divider borders; the dock separator.
- **Dot**: the dot field only.

Chrome hover is ink at 7% mixed into transparent, so it reads the same on glass in both themes.

### Named Rules
**The One Accent Rule.** Teal marks focus, selection and the agent at work. It is never decorative, and no second hue joins it. Errors use ink and an `x` mark, not red.

**The Two-Layer Rule.** Widgets are flat paper; only floating chrome is glass. Glass never sits on glass: the dock hides while Spotlight is open, and popovers inside glass (anchor picker, dock hint) are solid card.

## Typography

**Body Font:** Inter (system-ui fallback)
**Label/Mono Font:** JetBrains Mono (ui-monospace fallback)

Inter carries what a person reads as prose: Spotlight rows and input, note text, the agent's replies. JetBrains Mono carries labels, keys, sizes like `2x1`, app glyphs and the ASCII frames. Mono is the product's motion medium, not a costume.

### Hierarchy
- **Input** (Inter 400, 16px, 1.4): the Spotlight field.
- **Body** (Inter 400, 14px, 1.5): Spotlight rows, widget text.
- **Bubble** (Inter 400, 13px, 1.45): agent replies.
- **Mono** (JetBrains Mono 400, 12px, 1.7): data blocks, terminal output, dock chips, glyphs, the wordmark.
- **Label** (JetBrains Mono 400, 11px, 0.04em): frame labels, chips, menu bar, Spotlight footer.
- **Micro** (JetBrains Mono 400, 10px): Spotlight group names (0.06em) and keys inside chrome.
- **Frame** (JetBrains Mono 13px / 16px): the ASCII border grid, fixed so characters land on card edges.
- **Face** (JetBrains Mono 600, 20px / 22px): the avatar's 3×2 character face.

### Named Rules
**The ASCII-Born Rule.** Things enter, move and leave through ASCII frames, and the system marks things in characters (`[=]`, `>`, `x`, the face). The clean border is the resting state, not the default render.

## Layout

A 6×4 grid of 160px square cells with 16px gaps, centered on the stage and scaled down (never up, minimum 0.3) to fit the window minus 24px sides and the chrome room (40px top, 72px bottom). Widget sizes are 1x1, 2x1, 1x2, 2x2 and 4x2. Cards pad 18px at the sides and 38px at the top to clear the label.

The menu bar is a single 32px line across the top. The dock is a pill 16px above the bottom edge. Spotlight is a sheet up to 560px wide, placed 9vh below the chrome. The avatar rests at one of seven anchors (four corners, top and bottom center, center) inside the viewport minus the chrome, 16px from the edges. When it rests at center the stage dims to 40% so the conversation leads. Fullscreen apps fill the screen inside the chrome and step 100px away from whichever side the avatar rests on, so neither covers the other.

Stacking, back to front: dots, stage, fullscreen, dock flights, menu bar, dock, agent, Spotlight.

## Elevation & Depth

Depth is quiet. Cards sit almost flat on the paper. Glass chrome floats higher, with a 1px top highlight, a rule border and a deeper soft shadow. The menu bar is the lowest glass: highlight and a hairline shadow only. A scrim of paper at 60% pushes the grid back when Spotlight or a fullscreen app comes forward.

### Shadow Vocabulary
- **Card** (`0 1px 2px var(--shadow), 0 8px 24px var(--shadow)`): widgets at rest.
- **Float** (`inset 0 1px 0 var(--glass-edge), 0 1px 1px var(--shadow), 0 16px 40px var(--shadow-float)`): dock, Spotlight, avatar, bubble.
- **Bar** (`inset 0 1px 0 var(--glass-edge), 0 1px 2px var(--shadow)`): the menu bar.
- **Popover** (`0 1px 2px var(--shadow), 0 16px 40px var(--shadow-float)`): solid popovers such as the anchor picker.

### Named Rules
**The Same-Path Rule.** Things leave the way they came. Spotlight grows out of whatever opened it (the ⌘K button, the dock's apps chip, the avatar) and shrinks back into it, returning focus there. Minimized apps fly into their dock chip and back to their cell; fullscreen grows from and returns to its cell; the dock slides down past the edge it rose from.

## Shapes

Corners get softer as surfaces get bigger or more personal: keys 4px, chips and menu buttons 6px, Spotlight rows 8px, cards and popovers 12px, the bubble 14px, the Spotlight sheet 16px, the avatar 20px, and the dock and its chips are full pills. Borders are always 1px rule; dividers inside sheets are 1px rule lines.

## Components

### Chips
Mono 11px, at least 30px tall, 1px rule border, 6px corners. Hover fills with paper; pressed (`aria-pressed`) inverts to ink; action chips use teal text; disabled drops to 35%. Every pressable control scales to .97 on pointer-down within 100ms.

### Keys
Inline `kbd` boxes with a rule border and 4px corners. Inside chrome they shrink to 10px pencil.

### Cards / Containers
The ASCII frame wraps every widget: card surface, rule border, 12px corners, card shadow, mono label top left. The surface appears only once the border has drawn. A widget focused from Spotlight or the dock gets a 2px teal ring 3px out.

### Inputs / Fields
The Spotlight input is borderless Inter 16px after a teal mono `>` mark, on a row divided from the results by a rule line. The caret is teal everywhere.

### Navigation
- **Menu bar:** a 32px glass line. Left: the `nexus` wordmark and the agent's status (a spinner while thinking, teal while working). Right: honest status words (`mic off`, `engine local`), the ⌘K ask button, the theme word, the avatar position control and a tabular clock. Status words drop out below 760px; controls stay.
- **Anchor picker:** a solid card popover with a 3×3 ASCII map of the screen; the current anchor is teal on teal soft. It pops in from its button (160ms, from .96 scale).
- **Dock:** a glass pill that appears only when something is minimized, when the pointer touches the bottom edge, or when summoned. One pill-shaped chip per minimized app with a pencil glyph that turns teal on focus, a rule separator, then `⌘K apps`. Focusing a chip shows a solid key hint above the dock.
- **Spotlight:** a glass sheet over a scrim. Grouped results (`on the desk`, `apps`, `ask nexus`) in a listbox with a 4ch glyph column, name, and pencil meta. The selected row gets the teal-soft wash and a teal glyph. A selected app shows an action bar of size and move chips; a key footer closes the sheet.

### Agent avatar (signature)
A 72px glass button with 20px corners holding a 3×2 character face: eyes over mouth (`o o` / `-` at idle, `| |` thinking with spinning eyes, `O O` listening, a talking mouth while speaking, `x x` / `~` on error). It blinks every 4–7 seconds, never breathes. Drag it with rubber-band resistance past the safe area; release projects where it would coast and snaps to the nearest anchor, with a little bounce if thrown fast. Arrow keys move it between anchors. While the agent works, its edge and face turn teal.

### Agent bubble
A glass bubble beside the avatar, on the side facing the screen center, scaling in from the corner nearest the avatar. Replies type in a character at a time at their final size, stay six seconds, and stay longer while hovered. Errors get an ink edge and a bold mono `x ` before the text; no second color.

## Do's and Don'ts

### Do:
- **Do** start every press response on pointer-down (scale .97).
- **Do** animate travel with springs that start from the current value and hand velocity off between gestures.
- **Do** let things exit along the path they entered and return focus to what opened them.
- **Do** fall back to solid card under `prefers-reduced-transparency`, and add an ink border under `prefers-contrast: more`.
- **Do** replace travel with a short fade or a jump under reduced motion.
- **Do** show honest system state ("engine local", "mic off") instead of invented numbers.
- **Do** mark state with characters and ink (`x`, a border) before reaching for color.

### Don't:
- **Don't** put glass on widgets or stack glass on glass; use a solid card popover inside chrome.
- **Don't** add title bars, drag handles or resize grips; the window manager stays hidden.
- **Don't** introduce a second accent hue, a red error state, or teal fills beyond the soft selection wash.
- **Don't** run slow ambient loops (breathing, drifting) on resting elements; the idle avatar blinks at random intervals instead.
- **Don't** show a permanent taskbar; the dock appears only when it has something to show.
