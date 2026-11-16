# Calculator Internal App

## Purpose
A small arithmetic widget that does exactly what it shows: an expression builds
in the display, evaluates live with real precedence (`evaluate.ts` — numbers,
+ − × ÷, `%` postfix, unary minus), and commits on `=`. Incomplete or
divide-by-zero expressions read as `…`, never as a wrong answer. The wide size
adds a history strip.

## Tech Stack
- React 19 + TypeScript + Vite
- No runtime `eval` — the evaluator is ~80 lines, pure and testable

## Folder Layout
```
internal-apps/calc/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── evaluate.ts
│       └── calc.css
└── backend/
    └── README.md
```

## Registry Entry
`calc` — sizes `1x1`, `2x1`, default `1x1`; no fullscreen view.
Aliases: calculator, calc, math.
