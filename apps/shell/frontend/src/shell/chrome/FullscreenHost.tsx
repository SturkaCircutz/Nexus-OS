import { getApp } from '@/apps/registry'
import { useDesktop } from '@/wm/desktopStore'
import { useHostSlot } from '../hostNodes'

/**
 * The fullscreen place. The app's own div flies here from its grid cell and back again
 * (see hostNodes); the cell stays reserved meanwhile. The scrim dims the grid behind it.
 */
export function FullscreenHost() {
  const { state, store } = useDesktop()
  const full = state.instances.find((it) => it.mode === 'fullscreen')

  return (
    <div className="nx-fullscreen" data-open={full ? '' : undefined}>
      <div className="nx-fullscreen-scrim" aria-hidden="true" onClick={() => store.exitFullscreen()} />
      {full && (
        <FullPanel
          key={full.id}
          id={full.id}
          label={getApp(full.appId).label}
          onBack={() => store.exitFullscreen()}
        />
      )}
    </div>
  )
}

function FullPanel({ id, label, onBack }: { id: string; label: string; onBack: () => void }) {
  const slotRef = useHostSlot(id, 'full')
  return (
    <section className="nx-fullscreen-panel" aria-label={`${label}, fullscreen`}>
      {/* The app's div is appended here; React keeps no children of its own inside. */}
      <div className="nx-fullscreen-slot" ref={slotRef} />
      <button type="button" className="nx-fullscreen-back chip nx-press" onClick={onBack} aria-keyshortcuts="Escape">
        <kbd>esc</kbd>back
      </button>
    </section>
  )
}
