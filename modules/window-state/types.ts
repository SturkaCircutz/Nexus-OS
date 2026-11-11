export type WindowMode = 'minimized' | 'windowed' | 'fullscreen'

export interface WindowState {
  id: string
  appId: string
  title: string
  mode: WindowMode
  x: number
  y: number
  width: number
  height: number
  workspaceId: string
  monitor: number
  focused: boolean
  zIndex: number
  isExternal: boolean
  externalHandle?: string
  gridCol?: number
  gridRow?: number
  gridW?: number
  gridH?: number
}

export interface DesktopGrid {
  cols: number
  rows: number
}

export interface DesktopSession {
  windows: WindowState[]
  focusedId: string | null
  activeWorkspaceId: string
  grid: DesktopGrid
}
