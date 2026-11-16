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

Status: **Adopted** — the plan's §9 decisions were resolved as recommended and
Phases 0–3 of the §8 roadmap have landed in `apps/shell/frontend/src/ui/` (tokens,
primitives, overlays, AI kit, media kit, templates, tests). Remaining work and the
decision record live at the top of [`plan.md`](./plan.md); start new UI work from
[`app-guide.md`](./app-guide.md) and import only from `@/ui`.
