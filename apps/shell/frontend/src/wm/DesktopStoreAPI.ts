import type {
  DesktopGrid,
  DesktopSession,
  WindowMode,
  WindowState,
} from '@/types/WindowState'

export type ArrangePreset = 'cascade' | 'tile' | 'snap-all-to-grid'

export interface OpenAppOptions {
  title?: string
  mode?: WindowMode
  x?: number
  y?: number
  width?: number
  height?: number
  workspaceId?: string
  monitor?: number
}

export interface DesktopStoreAPI {
  windows: WindowState[]
  focusedId: string | null
  activeWorkspaceId: string
  grid: DesktopGrid
  openApp(appId: string, options?: OpenAppOptions): string
  closeApp(id: string): void
  focusApp(id: string): void
  moveWindow(id: string, x: number, y: number): void
  resizeWindow(id: string, width: number, height: number): void
  setMode(id: string, mode: WindowMode): void
  arrange(preset: ArrangePreset): void
  switchWorkspace(id: string): void
  hydrate(session: DesktopSession): void
  getSnapshot(): DesktopSession
}
