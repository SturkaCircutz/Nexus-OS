# Files Internal App

## Purpose
The built-in files viewer: a virtual tree with breadcrumbs until the files
backend exists (fixture data, honestly marked). Folders open in place; files
preview by type — markdown and code read as mono, images render through the
media kit (`MediaSurface`), and types without a preview (media, binaries) show
their kind and say the preview lands with the backend instead of faking one.

## Tech Stack
- React 19 + TypeScript + Vite
- UI library: `MediaSurface` (from `@/ui`)

## Folder Layout
```
internal-apps/files/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       └── files.css
└── backend/
    └── README.md
```

## How to Add a Feature
Extend the fixture tree and the preview switch in `App.tsx`; when the backend
lands, the tree comes from IPC (`modules/ipc`) and only the data source changes.

## IPC / API Contracts
None yet — reserved for the files backend.

## Testing
No dedicated tests yet; covered by the shell build.
