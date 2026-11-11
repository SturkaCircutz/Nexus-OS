import type { AppProps } from '@/apps/types'
import './terminal.css'

const PROMPT = 'nexus$'

// Placeholder output until the terminal backend exists.
const SHORT = [`${PROMPT} agent status`, 'engine   ready', `${PROMPT} `]
const LONG = [`${PROMPT} agent status`, 'engine   ready', 'tools    5 loaded', 'memory   412 notes', '', `${PROMPT} `]

export function TerminalApp({ size }: AppProps) {
  const lines = size === '2x1' ? SHORT : LONG
  return (
    <pre className="w-mono w-term" aria-label="Terminal">
      {lines.map((line, i) => (
        <span key={i}>
          {line.startsWith(PROMPT) ? (
            <>
              <span className="w-term-prompt">{PROMPT}</span>
              {line.slice(PROMPT.length)}
            </>
          ) : (
            line
          )}
          {i === lines.length - 1 ? <span className="ascii-caret">_</span> : '\n'}
        </span>
      ))}
    </pre>
  )
}
