// Every app the shell can open. Add an app here and the grid, agent and tray pick it up.

import { ClockApp } from '@/internal-apps/clock/frontend/src/App'
import { FilesApp } from '@/internal-apps/files/frontend/src/App'
import { NotesApp } from '@/internal-apps/notes/frontend/src/App'
import { SystemMonitorApp } from '@/internal-apps/system-monitor/frontend/src/App'
import { TerminalApp } from '@/internal-apps/terminal/frontend/src/App'
import { SIZE_ORDER, type Size } from '@/wm/layout'
import type { AppDef } from './types'

export const APPS = {
  clock: {
    label: 'clock',
    glyph: '(:)',
    sizes: ['1x1', '2x1', '2x2'],
    defaultSize: '2x2',
    aliases: ['clock', 'time', 'watch'],
    fullscreen: false,
    phase: 'mvp',
    component: ClockApp,
  },
  notes: {
    label: 'notes',
    glyph: '[=]',
    sizes: ['2x1', '1x2', '2x2'],
    defaultSize: '2x1',
    aliases: ['notes', 'note', 'notepad', 'memo'],
    fullscreen: true,
    phase: 'mvp',
    component: NotesApp,
  },
  files: {
    label: 'files',
    glyph: '[/]',
    sizes: ['1x1', '2x1'],
    defaultSize: '1x1',
    aliases: ['files', 'file', 'documents', 'docs'],
    fullscreen: true,
    phase: 'mvp',
    component: FilesApp,
  },
  terminal: {
    label: 'terminal',
    glyph: '[>]',
    sizes: ['2x1', '2x2', '4x2'],
    defaultSize: '2x1',
    aliases: ['terminal', 'term', 'shell', 'console', 'cli'],
    fullscreen: false,
    phase: 'mvp',
    component: TerminalApp,
  },
  monitor: {
    label: 'system',
    glyph: '[#]',
    sizes: ['1x1', '2x1'],
    defaultSize: '1x1',
    aliases: ['monitor', 'system', 'stats', 'cpu', 'memory', 'ram', 'usage'],
    fullscreen: false,
    phase: 'mvp',
    component: SystemMonitorApp,
  },
} satisfies Record<string, AppDef>

export type AppId = keyof typeof APPS

export const APP_IDS = Object.keys(APPS) as AppId[]

export const isAppId = (v: unknown): v is AppId => typeof v === 'string' && v in APPS

export function getApp(id: AppId): AppDef {
  return APPS[id]
}

/** The supported size closest to the one asked for (ties go to the larger one). */
export function nearestSize(id: AppId, wanted: Size): Size {
  const { sizes } = getApp(id)
  if (sizes.includes(wanted)) return wanted
  const target = SIZE_ORDER.indexOf(wanted)
  return [...sizes].sort(
    (a, b) =>
      Math.abs(SIZE_ORDER.indexOf(a) - target) - Math.abs(SIZE_ORDER.indexOf(b) - target) ||
      SIZE_ORDER.indexOf(b) - SIZE_ORDER.indexOf(a),
  )[0]
}
