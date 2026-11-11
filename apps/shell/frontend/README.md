# Shell Frontend (Presentation Shell)

## Purpose
React 19 desktop shell hosted inside Tauri. Renders the taskbar, widget canvas, workspaces, window snapping, and mounts internal apps.

## Tech Stack
- React 19, TypeScript, Tailwind CSS, Lucide Icons, Vite, MediaPipe Tasks Vision

## Folder Layout
```
apps/shell/frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/          # WindowFrame, Taskbar, WorkspaceCanvas
│   ├── hooks/               # useDesktopState, useIPC, useGesture
│   ├── internal-apps/       # notes, files, terminal, system-monitor (frontend + backend each)
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
1. UI component → `src/components/`
2. Hook → `src/hooks/`
3. New internal app → `src/internal-apps/<app>/frontend` + `backend`
4. Type → `src/types/`

## IPC / API Contracts
Consumes Tauri commands exposed by `src-tauri/src/commands/`. See `src/types/ipc.ts`.

## Testing

Run the frontend suite once:

```bash
npm run test:run
```

Use `npm test` for watch mode. The Search & Discover tests use Vitest, React Testing Library, JSDOM, and the generated search contracts.
