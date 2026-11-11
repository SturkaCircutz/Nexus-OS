# UI Library

Shared baseline UI foundation for the Nexus OS shell — tokens, ASCII/motion
primitives, components, AI-native visualization kit and app templates.

- [`plan.md`](./plan.md) — the architecture & implementation plan: audit of the
  existing shell, the layered library design, component inventory (including the
  media/content widget kit for the browserless, widget-first product model),
  design system spec, motion spec, Window-Manager integration contract, project
  structure, roadmap, open technical decisions and testing strategy.
- [`app-guide.md`](./app-guide.md) — hands-on guide for building a new app/widget
  on the shell: the `AppProps`/registry contract, folder anatomy, sizing rules,
  what to import, persistence, fullscreen, media widgets, a full worked example
  (timer widget) and a definition-of-done checklist.

Status: **Proposed** — awaiting sign-off on the open decisions in `plan.md` §9
(visual direction, legacy cleanup, engine wiring) before implementation begins.
