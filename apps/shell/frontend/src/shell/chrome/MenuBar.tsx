import { useEffect, useState } from 'react'
import { useTheme } from '@/theme'
import { AsciiSpinner } from '@/ui'
import { useAgent, type AgentStatus } from '../agent/agentStore'
import { AnchorPicker } from './AnchorPicker'

export const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
export const MOD = IS_MAC ? '⌘' : 'Ctrl'

const STATUS_TEXT: Record<AgentStatus, string> = {
  idle: 'ready',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'replying',
  error: "didn't get that",
}

interface MenuBarProps {
  onAsk: (origin: HTMLElement) => void
  onToggleTheme: () => void
}

/**
 * One quiet glass line at the top. Status on the left, controls and the time on the right.
 * Every value here is real: no invented health numbers.
 */
export function MenuBar({ onAsk, onToggleTheme }: MenuBarProps) {
  const { state } = useAgent()
  const { theme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <header className="nx-menubar nx-glass">
      <div className="nx-menubar-group">
        <span className="nx-wordmark">nexus</span>
        <span className="nx-menubar-status" data-status={state.status}>
          {state.status === 'thinking' ? <AsciiSpinner label="thinking" /> : <span aria-hidden="true">·</span>}{' '}
          {STATUS_TEXT[state.status]}
        </span>
      </div>
      <div className="nx-menubar-group">
        {/* Voice and the engine aren't connected yet; say so instead of faking it. */}
        <span className="nx-menubar-item" title="Voice input isn't connected yet">
          mic off
        </span>
        <span className="nx-menubar-item" title="The local keyword agent is answering; the engine isn't connected yet">
          engine local
        </span>
        <button
          type="button"
          className="nx-menubar-btn nx-press"
          data-spotlight-origin
          onClick={(e) => onAsk(e.currentTarget)}
          aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        >
          <kbd>{MOD}</kbd>
          <kbd>K</kbd>ask
        </button>
        <button
          type="button"
          className="nx-menubar-btn nx-press"
          onClick={onToggleTheme}
          // Starts with the visible word, so voice control can say what it sees.
          aria-label={`${theme} mode, switch to ${next}`}
        >
          {theme}
        </button>
        <AnchorPicker />
        <Clock />
      </div>
    </header>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let id = 0
    // Tick on the minute so the time never lags.
    const schedule = () => {
      id = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60_000 - (Date.now() % 60_000) + 50)
    }
    schedule()
    return () => window.clearTimeout(id)
  }, [])
  const text = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <time className="nx-menubar-item nx-menubar-clock" dateTime={now.toISOString()}>
      {text}
    </time>
  )
}
