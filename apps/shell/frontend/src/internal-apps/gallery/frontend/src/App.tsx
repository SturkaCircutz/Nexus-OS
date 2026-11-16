import { useMemo } from 'react'
import { useDesktopCommands, useDesktopInstances } from '@/ui'
import { APP_IDS, getApp, type AppId } from '@/apps/registry'
import type { AppProps } from '@/apps/types'
import './gallery.css'

// The app gallery: every app the shell knows, as tiles. Opening one is a desk
// command through the UI seam — the gallery never touches the window manager.

type Desk = 'open' | 'minimized' | null

export function GalleryApp({ size, mode }: AppProps) {
  const commands = useDesktopCommands()
  const instances = useDesktopInstances()

  const status = useMemo(() => {
    const map = new Map<AppId, Exclude<Desk, null>>()
    for (const it of instances) map.set(it.appId, it.mode === 'minimized' ? 'minimized' : 'open')
    return map
  }, [instances])

  const open = (id: AppId) => commands.open(id)

  if (mode === 'fullscreen') {
    return (
      <div className="w-gallery" data-view="full">
        <p className="w-gallery-head">every app · a dot means it's already on the desk</p>
        <ul className="w-gallery-grid w-gallery-grid--full">
          {APP_IDS.map((id) => (
            <Tile key={id} id={id} desk={status.get(id) ?? null} onOpen={open} showSizes />
          ))}
        </ul>
      </div>
    )
  }

  if (size === '1x2') {
    // Tall and narrow: glyph chips only.
    return (
      <div className="w-gallery" data-view="strip">
        <ul className="w-gallery-strip">
          {APP_IDS.map((id) => (
            <Tile key={id} id={id} desk={status.get(id) ?? null} onOpen={open} compact />
          ))}
        </ul>
      </div>
    )
  }

  const cols = size === '2x1' ? 2 : size === '2x2' ? 3 : 5
  return (
    <div className="w-gallery" data-view="grid">
      <ul className="w-gallery-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {APP_IDS.map((id) => (
          <Tile key={id} id={id} desk={status.get(id) ?? null} onOpen={open} />
        ))}
      </ul>
    </div>
  )
}

interface TileProps {
  id: AppId
  desk: Desk
  onOpen: (id: AppId) => void
  compact?: boolean
  showSizes?: boolean
}

function Tile({ id, desk, onOpen, compact, showSizes }: TileProps) {
  const app = getApp(id)
  return (
    <li>
      <button
        type="button"
        className="w-gallery-tile"
        data-desk={desk ?? undefined}
        title={app.aliases[0]}
        onClick={() => onOpen(id)}
      >
        <span className="w-gallery-glyph" aria-hidden="true">
          {app.glyph}
        </span>
        {!compact && <span className="w-gallery-label">{app.label}</span>}
        {showSizes && (
          <span className="w-gallery-sizes" aria-hidden="true">
            {app.sizes.join(' · ')}
          </span>
        )}
        {desk && (
          <span className="w-gallery-dot" role="img" aria-label={desk === 'minimized' ? 'minimized' : 'open'}>
            {desk === 'minimized' ? '·' : '•'}
          </span>
        )}
      </button>
    </li>
  )
}
