import { getApp } from '@/apps/registry'
import type { AppMode } from '@/apps/types'
import type { AppInstance } from '@/wm/desktopStore'

/** Renders an app instance's component from the registry. */
export function AppHost({ instance, mode = instance.mode }: { instance: AppInstance; mode?: AppMode }) {
  const App = getApp(instance.appId).component
  return <App instanceId={instance.id} size={instance.size} mode={mode} />
}
