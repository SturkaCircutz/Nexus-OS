import { useDesktopCommands, useDesktopInstances, type DesktopCommands } from '@/ui'
import { getApp, type AppId } from '@/apps/registry'
import type { AppMode, AppProps } from '@/apps/types'
import type { Size } from '@/wm/layout'
import './wm.css'

// The window manager widget: the desk, as a list. Every row is one open app with
// its controls — resize, fullscreen, minimize, close — driven through the same
// store commands the agent uses, via the UI seam.

export function WmApp({ size }: AppProps) {
  const commands = useDesktopCommands()
  const instances = useDesktopInstances()

  if (instances.length === 0) {
    return (
      <div className="w-wm">
        <p className="w-wm-empty">the desk is clear.</p>
      </div>
    )
  }

  const roomy = size !== '2x1'
  return (
    <div className="w-wm">
      <ul className="w-wm-list">
        {instances.map((it) => (
          <Row key={it.id} id={it.appId} size={it.size} mode={it.mode} roomy={roomy} commands={commands} />
        ))}
      </ul>
      {roomy && (
        <div className="w-wm-foot">
          <button type="button" className="w-wm-verb" onClick={() => commands.tidy()}>
            tidy
          </button>
          <button type="button" className="w-wm-verb" onClick={() => commands.closeAll()}>
            clear desk
          </button>
        </div>
      )}
    </div>
  )
}

interface RowProps {
  id: AppId
  size: Size
  mode: AppMode
  roomy: boolean
  commands: DesktopCommands
}

function Row({ id, size, mode, roomy, commands }: RowProps) {
  const app = getApp(id)
  return (
    <li className="w-wm-row">
      <span className="w-wm-glyph" aria-hidden="true">
        {app.glyph}
      </span>
      <span className="w-wm-label">{app.label}</span>
      {roomy && <span className="w-wm-size">{size}</span>}
      {mode !== 'widget' && <span className="w-wm-mode">{mode}</span>}
      <span className="w-wm-controls">
        <button type="button" className="w-wm-ctl" aria-label={`make ${app.label} smaller`} onClick={() => commands.resize(id, 'down')}>
        −
        </button>
        <button type="button" className="w-wm-ctl" aria-label={`make ${app.label} bigger`} onClick={() => commands.resize(id, 'up')}>
          +
        </button>
        {app.fullscreen && (
          <button
            type="button"
            className="w-wm-ctl"
            aria-label={`${app.label} fullscreen`}
            onClick={() => (mode === 'fullscreen' ? commands.exitFullscreen() : commands.fullscreen(id))}
          >
            {mode === 'fullscreen' ? 'v' : '^'}
          </button>
        )}
        {mode === 'minimized' ? (
          <button type="button" className="w-wm-ctl" aria-label={`restore ${app.label}`} onClick={() => commands.restore(id)}>
            o
          </button>
        ) : (
          <button type="button" className="w-wm-ctl" aria-label={`minimize ${app.label}`} onClick={() => commands.minimize(id)}>
            _
          </button>
        )}
        <button type="button" className="w-wm-ctl" aria-label={`close ${app.label}`} onClick={() => commands.close(id)}>
          x
        </button>
      </span>
    </li>
  )
}
