import type { ComponentType } from 'react'
import type { Size } from '@/wm/layout'

/** How an open app is shown. Minimized apps leave the grid but keep running. */
export type AppMode = 'widget' | 'fullscreen' | 'minimized'

/** Props every app component receives from the shell. */
export interface AppProps {
  instanceId: string
  size: Size
  mode: AppMode
}

export interface AppDef {
  label: string
  /** Short ASCII mark for the dock and spotlight, e.g. '[#]'. */
  glyph: string
  /** Every size this app has a layout for. */
  sizes: Size[]
  defaultSize: Size
  /** Words the agent matches on, e.g. "show my notepad". */
  aliases: string[]
  /** Has a layout for fullscreen mode. */
  fullscreen: boolean
  /** 'mvp' apps come from the todo doc; 'later' ones are extras. */
  phase: 'mvp' | 'later'
  component: ComponentType<AppProps>
  // actions?: AgentAction[]  (deferred: apps declaring agent actions, after the Automations design)
}
