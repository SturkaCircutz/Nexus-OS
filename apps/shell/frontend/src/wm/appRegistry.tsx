/**
 * Placeholder content for internal apps, keyed by appId (Task B1).
 * Real app UIs belong to the OS Layout track; this only decides what a
 * WindowFrame renders and what the taskbar can launch.
 */

import type { ComponentType } from 'react'

import { ClockWidget } from '@/internal-apps/clock/frontend/src/App'
import { FilesApp } from '@/internal-apps/files/frontend/src/App'
import { NotesApp } from '@/internal-apps/notes/frontend/src/App'
import { SystemMonitorApp } from '@/internal-apps/system-monitor/frontend/src/App'
import { TerminalApp } from '@/internal-apps/terminal/frontend/src/App'
import type { Size } from '@/wm/snap'

export interface AppDefinition {
  appId: string
  title: string
  Component: ComponentType
  defaultSize: Size
}

// The shell's apps take grid props; free windows show them at their 2x2 size.
const NotesWidget = () => <NotesApp instanceId="wm.notes" size="2x2" mode="widget" />
const FilesWidget = () => <FilesApp instanceId="wm.files" size="2x2" mode="widget" />
const TerminalWidget = () => <TerminalApp instanceId="wm.terminal" size="2x2" mode="widget" />
const SystemMonitorWidget = () => <SystemMonitorApp instanceId="wm.system-monitor" size="2x2" mode="widget" />

function SettingsPlaceholder() {
  return (
    <div className="nexus-app-placeholder">
      <h2>Settings</h2>
      <p>Settings stub. No options yet.</p>
    </div>
  )
}

export const APP_REGISTRY: readonly AppDefinition[] = [
  { appId: 'nexus.notes', title: 'Notes', Component: NotesWidget, defaultSize: { width: 520, height: 360 } },
  { appId: 'nexus.files', title: 'Files', Component: FilesWidget, defaultSize: { width: 560, height: 380 } },
  { appId: 'nexus.terminal', title: 'Terminal', Component: TerminalWidget, defaultSize: { width: 600, height: 340 } },
  {
    appId: 'nexus.system-monitor',
    title: 'System Monitor',
    Component: SystemMonitorWidget,
    defaultSize: { width: 480, height: 320 },
  },
  { appId: 'nexus.clock', title: 'Clock', Component: ClockWidget, defaultSize: { width: 336, height: 160 } },
  { appId: 'nexus.settings', title: 'Settings', Component: SettingsPlaceholder, defaultSize: { width: 480, height: 360 } },
]

export function getAppDefinition(appId: string): AppDefinition | undefined {
  return APP_REGISTRY.find((app) => app.appId === appId)
}
