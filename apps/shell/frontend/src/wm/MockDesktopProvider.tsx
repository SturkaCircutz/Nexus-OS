/**
 * Reactive mock of the desktop store for WM-B UI work (Task D0-D1).
 *
 * Provides the complete frozen DesktopStoreAPI through Yash's
 * DesktopStoreContextProvider, so components only ever call useDesktopStore().
 * With `persist`, the session is restored from storage on mount and saved on
 * every change (see sessionPersistence.ts). No IPC. On glue day App.tsx swaps
 * this for the real provider, which can reuse the same persister.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react'

import type { DesktopSession } from '@/types/WindowState'
import type { DesktopStoreAPI } from '@/wm/DesktopStoreAPI'
import { DesktopStoreContextProvider } from '@/wm/DesktopStoreContext'
import { createMockDesktopStore } from '@/wm/mockDesktopStore'
import {
  createSessionPersister,
  getDefaultStorage,
  loadSession,
  type SessionStorage,
} from '@/wm/sessionPersistence'
import type { Size } from '@/wm/snap'

interface MockDesktopProviderProps extends PropsWithChildren {
  /** Starting session. Defaults to the Notes + Files seed. Read once on mount. */
  initialSession?: DesktopSession
  /** Current canvas size; only used by `arrange()`. */
  canvasSize?: Size
  /**
   * Restore the last saved session on mount and save changes to storage.
   * An explicit `initialSession` still wins over the saved one.
   */
  persist?: boolean
  /** Storage used when `persist` is on. Defaults to localStorage. Read once on mount. */
  storage?: SessionStorage | null
}

export function MockDesktopProvider({
  initialSession,
  canvasSize,
  persist = false,
  storage,
  children,
}: MockDesktopProviderProps) {
  const [resolvedStorage] = useState(() => (storage === undefined ? getDefaultStorage() : storage))

  const canvasSizeRef = useRef<Size | undefined>(canvasSize)
  useEffect(() => {
    canvasSizeRef.current = canvasSize
  }, [canvasSize])

  const [store] = useState(() =>
    createMockDesktopStore({
      initialSession: initialSession ?? (persist ? loadSession(resolvedStorage) ?? undefined : undefined),
      getCanvasSize: () => {
        const size = canvasSizeRef.current
        return size && size.width > 0 && size.height > 0 ? size : undefined
      },
    }),
  )

  useEffect(() => {
    if (!persist) return
    const persister = createSessionPersister(store, { storage: resolvedStorage })
    // Debounced saves can be lost if the page closes mid-window; flush on hide.
    const onHide = () => persister.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persister.flush()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
      persister.dispose()
    }
  }, [persist, store, resolvedStorage])

  const session = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  const value = useMemo<DesktopStoreAPI>(
    () => ({
      windows: session.windows,
      focusedId: session.focusedId,
      activeWorkspaceId: session.activeWorkspaceId,
      grid: session.grid,
      openApp: store.openApp,
      closeApp: store.closeApp,
      focusApp: store.focusApp,
      moveWindow: store.moveWindow,
      resizeWindow: store.resizeWindow,
      setMode: store.setMode,
      arrange: store.arrange,
      switchWorkspace: store.switchWorkspace,
      hydrate: store.hydrate,
      getSnapshot: store.getSnapshot,
    }),
    [session, store],
  )

  return <DesktopStoreContextProvider value={value}>{children}</DesktopStoreContextProvider>
}
