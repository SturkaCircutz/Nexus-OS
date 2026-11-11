import { useState } from 'react'

import { Taskbar } from '@/components/Taskbar'
import { WorkspaceCanvas } from '@/components/WorkspaceCanvas'
import { MockDesktopProvider } from '@/wm/MockDesktopProvider'
import type { Size } from '@/wm/snap'

export const APP_NAME = 'NEXUS OS'

export function App() {
  const [canvasSize, setCanvasSize] = useState<Size>({ width: 0, height: 0 })

  // Glue day: replace MockDesktopProvider with the real DesktopProvider.
  return (
    <MockDesktopProvider canvasSize={canvasSize} persist>
      <div className="nexus-shell">
        <header className="nexus-header">
          {APP_NAME}
          <span className="nexus-header-badge">mock store</span>
        </header>
        <WorkspaceCanvas onSizeChange={setCanvasSize} />
        <Taskbar canvasSize={canvasSize} />
      </div>
    </MockDesktopProvider>
  )
}
