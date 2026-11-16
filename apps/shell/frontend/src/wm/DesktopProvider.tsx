/**
 * Production desktop store provider (WM-A / Tasks A1–A3).
 *
 * Drop-in replacement for MockDesktopProvider: same props, same
 * DesktopStoreAPI surface via useDesktopStore(). Persistence uses
 * createSessionPersister (localStorage). The store handle exposes flush()
 * for persist_workspace; useDesktopIPCBridge syncs IPC under Tauri.
 */

import {
  createContext,
  useContext,
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
import { createDesktopStore, type DesktopStore } from '@/wm/windowStore'
import {
  createSessionPersister,
  getDefaultStorage,
  loadSession,
  type SessionPersister,
  type SessionStorage,
} from '@/wm/sessionPersistence'
import type { Size } from '@/wm/snap'
import {
  useDesktopIPCBridge,
  type DesktopIPCBridgeOptions,
} from '@/wm/useDesktopIPCBridge'

interface DesktopProviderProps extends PropsWithChildren {
  /** Starting session. Defaults to the Notes + Files seed. Read once on mount. */
  initialSession?: DesktopSession
  /** Current canvas size; only used by `arrange()`. */
  canvasSize?: Size
  /**
   * Restore the last saved session on mount and save changes to storage.
   * An explicit `initialSession` still wins over the saved one.
   * Defaults to true for the production provider (A2).
   */
  persist?: boolean
  /** Storage used when `persist` is on. Defaults to localStorage. Read once on mount. */
  storage?: SessionStorage | null
  /**
   * IPC bridge options. Pass `false` to disable Tauri sync (tests).
   * DEV still exposes `window.nexusIPC` unless disabled.
   */
  ipc?: DesktopIPCBridgeOptions | false
}

/** Raw store + immediate persist flush for callers outside the render cycle (A3 IPC). */
export interface DesktopStoreHandle {
  store: DesktopStore
  /** Write any pending debounced save immediately. No-op when persist is off. */
  flush(): void
}

const DesktopStoreHandleContext = createContext<DesktopStoreHandle | null>(null)

/**
 * Store handle for callers outside the render cycle (A3 IPC).
 * Prefer `useDesktopStore()` for UI.
 */
export function useDesktopStoreHandle(): DesktopStoreHandle {
  const handle = useContext(DesktopStoreHandleContext)
  if (!handle) {
    throw new Error('useDesktopStoreHandle must be used within a DesktopProvider')
  }
  return handle
}

export function DesktopProvider({
  initialSession,
  canvasSize,
  persist = true,
  storage,
  ipc,
  children,
}: DesktopProviderProps) {
  const [resolvedStorage] = useState(() => (storage === undefined ? getDefaultStorage() : storage))

  const canvasSizeRef = useRef<Size | undefined>(canvasSize)
  useEffect(() => {
    canvasSizeRef.current = canvasSize
  }, [canvasSize])

  const [store] = useState(() =>
    createDesktopStore({
      initialSession:
        initialSession ?? (persist ? (loadSession(resolvedStorage) ?? undefined) : undefined),
      getCanvasSize: () => {
        const size = canvasSizeRef.current
        return size && size.width > 0 && size.height > 0 ? size : undefined
      },
    }),
  )

  const persisterRef = useRef<SessionPersister | null>(null)

  // A2 persistence: reuse createSessionPersister against the real store.
  useEffect(() => {
    if (!persist) {
      persisterRef.current = null
      return
    }
    const persister = createSessionPersister(store, { storage: resolvedStorage })
    persisterRef.current = persister
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
      if (persisterRef.current === persister) persisterRef.current = null
    }
  }, [persist, store, resolvedStorage])

  const handle = useMemo<DesktopStoreHandle>(
    () => ({
      store,
      flush() {
        persisterRef.current?.flush()
      },
    }),
    [store],
  )

  // A3: Tauri snapshot sync + ipc-request listener; DEV console nexusIPC.
  const bridgeOptions = useMemo<DesktopIPCBridgeOptions>(
    () => (ipc === false ? { isTauri: () => false, enableDevConsole: false } : (ipc ?? {})),
    [ipc],
  )
  useDesktopIPCBridge(handle, bridgeOptions)

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

  return (
    <DesktopStoreHandleContext.Provider value={handle}>
      <DesktopStoreContextProvider value={value}>{children}</DesktopStoreContextProvider>
    </DesktopStoreHandleContext.Provider>
  )
}
