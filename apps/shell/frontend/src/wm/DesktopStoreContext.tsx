import {
  createContext,
  useContext,
  type PropsWithChildren,
} from 'react'

import type { DesktopStoreAPI } from '@/wm/DesktopStoreAPI'

const DesktopStoreContext = createContext<DesktopStoreAPI | null>(null)

interface DesktopStoreContextProviderProps extends PropsWithChildren {
  value: DesktopStoreAPI
}

export function DesktopStoreContextProvider({
  value,
  children,
}: DesktopStoreContextProviderProps) {
  return (
    <DesktopStoreContext.Provider value={value}>
      {children}
    </DesktopStoreContext.Provider>
  )
}

export function useDesktopStore(): DesktopStoreAPI {
  const store = useContext(DesktopStoreContext)

  if (!store) {
    throw new Error(
      'useDesktopStore must be used within a DesktopStoreContextProvider',
    )
  }

  return store
}
