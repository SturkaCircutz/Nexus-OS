import { useCallback, useEffect, useState } from 'react'
import { ThemeProvider, useReducedMotion, useTheme } from '@/theme'
import { DesktopProvider, useDesktop } from '@/wm/desktopStore'
import { AgentProvider, useAgent, type AgentRun } from './agent/agentStore'
import { runCommand } from './agent/runCommand'
import { AgentAvatar } from './avatar/AgentAvatar'
import { Dock } from './chrome/Dock'
import { FullscreenHost } from './chrome/FullscreenHost'
import { MenuBar } from './chrome/MenuBar'
import { Spotlight } from './chrome/Spotlight'
import { DotField } from './DotField'
import { InstanceHost } from './InstanceHost'
import { WidgetGrid } from './WidgetGrid'

/** The whole screen. Providers first, then the layers back to front. */
export function Desktop() {
  return (
    <ThemeProvider>
      <DesktopProvider>
        <AgentLayer />
      </DesktopProvider>
    </ThemeProvider>
  )
}

/** Connects the agent to the desktop and theme, and owns the dock summon signal. */
function AgentLayer() {
  const { theme, setTheme } = useTheme()
  const { store: desktop } = useDesktop()
  const [dockSummon, setDockSummon] = useState(0)

  const run: AgentRun = (text, agent) =>
    runCommand(text, {
      desktop,
      theme,
      setTheme,
      moveAvatar: agent.setAnchor,
      showDock: () => setDockSummon((n) => n + 1),
    })

  return (
    <AgentProvider run={run}>
      <DesktopScreen dockSummon={dockSummon} summonDock={() => setDockSummon((n) => n + 1)} />
    </AgentProvider>
  )
}

interface SpotlightState {
  open: boolean
  origin: HTMLElement | null
}

function DesktopScreen({ dockSummon, summonDock }: { dockSummon: number; summonDock: () => void }) {
  const { theme, setTheme } = useTheme()
  const { state: desk, store: desktop } = useDesktop()
  const { state: agentState, store: agent } = useAgent()
  const reduced = useReducedMotion()
  const [spot, setSpot] = useState<SpotlightState>({ open: false, origin: null })

  const openSpotlight = useCallback((origin?: HTMLElement | null) => {
    setSpot({ open: true, origin: origin ?? document.querySelector<HTMLElement>('[data-spotlight-origin]') })
  }, [])
  const closeSpotlight = useCallback(() => setSpot((s) => ({ ...s, open: false })), [])

  // Desktop-wide keys. Layers that handle a key themselves (Spotlight, the dock, the
  // avatar picker) stop it before it reaches here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'k') {
        e.preventDefault()
        if (spot.open) closeSpotlight()
        else openSpotlight()
        return
      }
      if (spot.open) return
      if (e.key === '/' && !mod && !isTyping(e.target)) {
        e.preventDefault()
        openSpotlight()
      } else if (mod && e.key === '.') {
        e.preventDefault()
        summonDock()
      } else if (e.key === 'Escape' && desk.instances.some((i) => i.mode === 'fullscreen' && !i.exiting)) {
        e.preventDefault()
        desktop.exitFullscreen()
      } else if (mod && (key === 'm' || e.key === 'Enter')) {
        const it = desk.instances.find((i) => i.id === desk.focusedId && !i.exiting)
        if (!it) return
        e.preventDefault()
        if (key === 'm') agent.say(desktop.minimize(it.appId))
        else if (it.mode === 'fullscreen') desktop.exitFullscreen()
        else agent.say(desktop.fullscreen(it.appId))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spot.open, desk, desktop, agent, openSpotlight, closeSpotlight, summonDock])

  return (
    <div
      className="nx-desktop"
      data-reduced={reduced || undefined}
      data-focus={agentState.anchor === 'center' || undefined}
      data-avatar={agentState.anchor}
    >
      <DotField theme={theme} reduced={reduced} />
      <MenuBar onAsk={openSpotlight} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
      <main className="nx-stage" inert={spot.open || undefined}>
        <WidgetGrid />
      </main>
      <FullscreenHost />
      <InstanceHost />
      <AgentAvatar onOpen={openSpotlight} />
      <Dock suppressed={spot.open} summon={dockSummon} onApps={openSpotlight} />
      <Spotlight open={spot.open} origin={spot.origin} onClose={closeSpotlight} />
    </div>
  )
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
  )
}
