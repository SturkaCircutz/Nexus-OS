import { useCallback, useMemo } from 'react'
import { useDesktop, type AppInstance, type SizeRequest } from '@/wm/desktopStore'
import { getApp, type AppId } from '@/apps/registry'

// The WM integration seam: the one place the library reaches into the window
// manager, so apps never import `@/wm` directly (plan §6.2). It is thin and
// additive on purpose — the store keeps every capability; this only names the
// requests an app may make: about itself, about the desk, and what's on it.

export interface AppActions {
  /** Fullscreen if the app declares support; otherwise a polite no-op reply. */
  requestFullscreen: () => string
  requestMinimize: () => string
  requestClose: () => string
}

/**
 * App-side window requests, routed through the store like every other command.
 * Commands answer with the same short replies the agent speaks; an app that wants
 * the reply spoken passes it to the agent layer (shell-owned) itself.
 */
export function useAppActions(appId: AppId): AppActions {
  const { store } = useDesktop()

  const requestFullscreen = useCallback(
    () => store.fullscreen(appId),
    [appId, store],
  )
  const requestMinimize = useCallback(() => store.minimize(appId), [appId, store])
  const requestClose = useCallback(() => store.close(appId), [appId, store])

  return { requestFullscreen, requestMinimize, requestClose }
}

/** Every desk command an app may drive, answered with the agent's reply strings. */
export interface DesktopCommands {
  open: (appId: AppId, size?: SizeRequest) => string
  close: (appId: AppId) => string
  resize: (appId: AppId, req: SizeRequest) => string
  minimize: (appId: AppId) => string
  restore: (appId: AppId) => string
  fullscreen: (appId: AppId) => string
  exitFullscreen: () => string
  tidy: () => string
  closeAll: () => string
}

/** Desk-wide commands for the gallery and the window-manager widget. */
export function useDesktopCommands(): DesktopCommands {
  const { store } = useDesktop()
  return useMemo(
    () => ({
      open: (appId, size) => store.open(appId, size),
      close: (appId) => store.close(appId),
      resize: (appId, req) => store.resize(appId, req),
      minimize: (appId) => store.minimize(appId),
      restore: (appId) => store.restore(appId),
      fullscreen: (appId) => store.fullscreen(appId),
      exitFullscreen: () => store.exitFullscreen(),
      tidy: () => store.tidy(),
      closeAll: () => store.closeAll(),
    }),
    [store],
  )
}

/** What's on the desk, for status dots and lists (excludes exiting instances). */
export function useDesktopInstances(): readonly AppInstance[] {
  const { state } = useDesktop()
  return useMemo(() => state.instances.filter((it) => !it.exiting), [state.instances])
}
