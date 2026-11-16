import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { getApp } from '@/apps/registry'
import { useDesktop } from '@/wm/desktopStore'
import { useAgent } from '../agent/agentStore'
import { MOD } from './MenuBar'

// A summoned dock (keyboard or "show dock") tucks itself away after this long untouched.
const SUMMON_MS = 5000

interface DockProps {
  /** Spotlight is open: glass never sits on glass, so the dock steps aside. */
  suppressed: boolean
  /** Bumps each time the dock is summoned by key or command. */
  summon: number
  onApps: (origin: HTMLElement) => void
}

/**
 * Shows only when needed: while something is minimized, when the pointer reaches the
 * bottom edge, or when summoned. The main screen stays free of a taskbar otherwise.
 */
export function Dock({ suppressed, summon, onApps }: DockProps) {
  const { state, store } = useDesktop()
  const agent = useAgent().store
  const away = state.instances.filter((it) => it.mode === 'minimized' && !it.exiting)

  const [edge, setEdge] = useState(false)
  const [summoned, setSummoned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const inside = hovered || focused
  const [hint, setHint] = useState<string | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  // Where focus was before a summon, so hiding hands it back.
  const returnFocus = useRef<HTMLElement | null>(null)
  const edgeTimer = useRef(0)

  const visible = !suppressed && (away.length > 0 || edge || summoned || inside)

  useEffect(() => () => window.clearTimeout(edgeTimer.current), [])

  // A restored app's chip disappears without a blur event; recheck where focus went.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!dockRef.current?.contains(document.activeElement)) {
        setFocused(false)
        setHint(null)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [away.length])

  // Summoning reveals the dock and puts focus on its first chip.
  useEffect(() => {
    if (!summon) return
    const active = document.activeElement
    if (active instanceof HTMLElement && !dockRef.current?.contains(active)) returnFocus.current = active
    setSummoned(true)
    requestAnimationFrame(() => dockRef.current?.querySelector<HTMLElement>('button')?.focus())
  }, [summon])

  // A summoned dock leaves on its own unless the pointer or focus is on it.
  useEffect(() => {
    if (!summoned || inside) return
    const id = window.setTimeout(() => setSummoned(false), SUMMON_MS)
    return () => window.clearTimeout(id)
  }, [summoned, inside])

  const hide = () => {
    setSummoned(false)
    setEdge(false)
    setHovered(false)
    setFocused(false)
    const back = returnFocus.current
    returnFocus.current = null
    if (back?.isConnected) back.focus({ preventScroll: true })
    else (document.activeElement as HTMLElement | null)?.blur()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      hide()
      return
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const chips = [...(dockRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
    const i = chips.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    chips[(i + (e.key === 'ArrowRight' ? 1 : chips.length - 1)) % chips.length].focus()
  }

  return (
    <>
      {/* The bottom 8px of the screen calls the dock up. Leaving the edge without
          reaching the dock lets it go again after a moment. */}
      <div
        className="nx-dock-edge"
        aria-hidden="true"
        onPointerEnter={() => {
          window.clearTimeout(edgeTimer.current)
          setEdge(true)
        }}
        onPointerLeave={() => {
          edgeTimer.current = window.setTimeout(() => setEdge(false), 500)
        }}
      />
      <div
        ref={dockRef}
        className="nx-dock nx-glass"
        data-visible={visible || undefined}
        role="toolbar"
        aria-label="Dock"
        aria-hidden={visible ? undefined : true}
        inert={!visible}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          setHovered(false)
          setEdge(false)
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setFocused(false)
            setHint(null)
          }
        }}
        onKeyDown={onKeyDown}
      >
        {away.map((it) => {
          const app = getApp(it.appId)
          const keys = app.fullscreen ? '↵ restore · f full · x close' : '↵ restore · x close'
          return (
            <button
              key={it.id}
              type="button"
              className="nx-dock-chip nx-press"
              data-dock-chip={it.id}
              aria-label={`${app.label}, minimized. Enter restores${app.fullscreen ? ', F opens fullscreen' : ''}, X closes`}
              aria-keyshortcuts={app.fullscreen ? 'F X' : 'X'}
              onFocus={() => setHint(keys)}
              onClick={() => {
                const reply = store.restore(it.appId)
                if (store.find(it.appId)?.mode === 'minimized') agent.say({ text: reply, error: true })
              }}
              onKeyDown={(e) => {
                if (e.metaKey || e.ctrlKey || e.altKey) return
                const k = e.key.toLowerCase()
                if (k === 'f' && app.fullscreen) {
                  e.preventDefault()
                  agent.say(store.fullscreen(it.appId))
                } else if (k === 'x') {
                  e.preventDefault()
                  agent.say(store.close(it.appId))
                }
              }}
            >
              <span className="nx-dock-glyph" aria-hidden="true">
                {app.glyph}
              </span>
              {app.label}
            </button>
          )
        })}
        {away.length > 0 && <span className="nx-dock-rule" aria-hidden="true" />}
        <button
          type="button"
          className="nx-dock-chip nx-dock-apps nx-press"
          onFocus={() => setHint(`${MOD} K opens the app gallery`)}
          onClick={(e) => onApps(e.currentTarget)}
        >
          <kbd>{MOD}</kbd>
          <kbd>K</kbd>apps
        </button>
        {hint && (
          <p className="nx-dock-hint" aria-hidden="true">
            {hint}
          </p>
        )}
      </div>
    </>
  )
}
