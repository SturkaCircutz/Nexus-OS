// Every app the shell can open. Add an app here and the grid, agent and tray pick it up.

import { BrowserApp } from '@/internal-apps/browser/frontend/src/App'
import { CalcApp } from '@/internal-apps/calc/frontend/src/App'
import { CalendarApp } from '@/internal-apps/calendar/frontend/src/App'
import { ClockApp } from '@/internal-apps/clock/frontend/src/App'
import { FilesApp } from '@/internal-apps/files/frontend/src/App'
import { GalleryApp } from '@/internal-apps/gallery/frontend/src/App'
import { NotesApp } from '@/internal-apps/notes/frontend/src/App'
import { SettingsApp } from '@/internal-apps/settings/frontend/src/App'
import { SystemMonitorApp } from '@/internal-apps/system-monitor/frontend/src/App'
import { TerminalApp } from '@/internal-apps/terminal/frontend/src/App'
import { TimerApp } from '@/internal-apps/timer/frontend/src/App'
import { WmApp } from '@/internal-apps/wm/frontend/src/App'
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
    sizes: ['1x1', '2x1', '2x2'],
    defaultSize: '2x1',
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
  timer: {
    label: 'timer',
    glyph: '[t]',
    sizes: ['1x1', '2x1'],
    defaultSize: '1x1',
    aliases: ['timer', 'countdown', 'stopwatch'],
    fullscreen: false,
    phase: 'later',
    component: TimerApp,
  },
  gallery: {
    label: 'gallery',
    glyph: '[:]',
    sizes: ['1x2', '2x1', '2x2', '4x2'],
    defaultSize: '2x2',
    aliases: ['gallery', 'apps', 'launcher', 'all apps'],
    fullscreen: true,
    phase: 'mvp',
    component: GalleryApp,
  },
  browser: {
    label: 'browser',
    glyph: '(~)',
    sizes: ['2x1', '2x2', '4x2'],
    defaultSize: '2x2',
    aliases: ['browser', 'web', 'search', 'browse'],
    fullscreen: true,
    phase: 'mvp',
    component: BrowserApp,
  },
  wm: {
    label: 'windows',
    glyph: '[+]',
    sizes: ['2x1', '2x2'],
    defaultSize: '2x2',
    aliases: ['windows', 'wm', 'window manager', 'layout', 'arrange', 'desk'],
    fullscreen: false,
    phase: 'mvp',
    component: WmApp,
  },
  settings: {
    label: 'settings',
    glyph: '[*]',
    sizes: ['1x1', '2x1'],
    defaultSize: '1x1',
    aliases: ['settings', 'preferences', 'config', 'theme'],
    fullscreen: false,
    phase: 'mvp',
    component: SettingsApp,
  },
  calc: {
    label: 'calc',
    glyph: '[±]',
    sizes: ['1x1', '2x1'],
    defaultSize: '1x1',
    aliases: ['calculator', 'calc', 'math'],
    fullscreen: false,
    phase: 'later',
    component: CalcApp,
  },
  calendar: {
    label: 'calendar',
    glyph: '[|]',
    sizes: ['1x1', '2x1', '2x2'],
    defaultSize: '2x2',
    aliases: ['calendar', 'month', 'schedule', 'dates'],
    fullscreen: false,
    phase: 'later',
    component: CalendarApp,
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
