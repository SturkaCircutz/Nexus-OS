/**
 * Taskbar (WM-B / Task B3).
 *
 * - Launchers open internal apps (Notes, Files, Terminal, System Monitor, Settings stub)
 * - One button per window in the active workspace:
 *     minimized -> restore + focus, focused -> minimize, otherwise -> focus
 * - Arrange presets (cascade / tile / grid) and a workspace switcher
 */

import type { WindowState } from '@/types/WindowState'
import { APP_REGISTRY, type AppDefinition } from '@/wm/appRegistry'
import { applyArrangement } from '@/wm/arrange'
import type { ArrangePreset } from '@/wm/DesktopStoreAPI'
import { useDesktopStore } from '@/wm/DesktopStoreContext'
import type { Size } from '@/wm/snap'

export const WORKSPACES = [
  { id: 'default', label: '1' },
  { id: 'workspace-2', label: '2' },
] as const

const ARRANGE_PRESETS: { preset: ArrangePreset; label: string }[] = [
  { preset: 'cascade', label: 'Cascade' },
  { preset: 'tile', label: 'Tile' },
  { preset: 'snap-all-to-grid', label: 'Grid' },
]

interface TaskbarProps {
  /** Current WorkspaceCanvas size; needed to compute arrange layouts. */
  canvasSize: Size
}

export function Taskbar({ canvasSize }: TaskbarProps) {
  const store = useDesktopStore()
  const { windows, activeWorkspaceId, openApp, setMode, focusApp, switchWorkspace } = store

  const workspaceWindows = windows.filter((w) => w.workspaceId === activeWorkspaceId)
  const canArrange = canvasSize.width > 0 && workspaceWindows.some((w) => w.mode === 'windowed')

  function launch(app: AppDefinition) {
    openApp(app.appId, {
      title: app.title,
      width: app.defaultSize.width,
      height: app.defaultSize.height,
    })
  }

  function toggleWindow(w: WindowState) {
    if (w.mode === 'minimized') {
      setMode(w.id, 'windowed')
      focusApp(w.id)
    } else if (w.focused) {
      setMode(w.id, 'minimized')
    } else {
      focusApp(w.id)
    }
  }

  return (
    <footer className="nexus-taskbar">
      <nav className="nexus-taskbar-group" aria-label="Launch apps">
        {APP_REGISTRY.map((app) => (
          <button
            key={app.appId}
            type="button"
            className="nexus-taskbar-button is-launcher"
            data-launch={app.appId}
            onClick={() => launch(app)}
          >
            {app.title}
          </button>
        ))}
      </nav>

      <div className="nexus-taskbar-group nexus-taskbar-windows" role="toolbar" aria-label="Open windows">
        {workspaceWindows.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`nexus-taskbar-button is-window${w.focused ? ' is-focused' : ''}${w.mode === 'minimized' ? ' is-minimized' : ''}`}
            data-window-button={w.id}
            aria-pressed={w.focused}
            title={w.mode === 'minimized' ? `Restore ${w.title}` : w.title}
            onClick={() => toggleWindow(w)}
          >
            {w.title}
          </button>
        ))}
      </div>

      <div className="nexus-taskbar-group" aria-label="Arrange windows">
        {ARRANGE_PRESETS.map(({ preset, label }) => (
          <button
            key={preset}
            type="button"
            className="nexus-taskbar-button"
            data-arrange={preset}
            disabled={!canArrange}
            onClick={() => applyArrangement(store, preset, canvasSize)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="nexus-taskbar-group" aria-label="Workspaces">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            type="button"
            className={`nexus-taskbar-button is-workspace${ws.id === activeWorkspaceId ? ' is-active' : ''}`}
            data-workspace-button={ws.id}
            aria-pressed={ws.id === activeWorkspaceId}
            title={`Workspace ${ws.label}`}
            onClick={() => switchWorkspace(ws.id)}
          >
            {ws.label}
          </button>
        ))}
      </div>
    </footer>
  )
}
