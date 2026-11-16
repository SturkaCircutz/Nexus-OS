import { useEffect, useState } from 'react'
import { useReducedMotion } from '@/theme'
import { FRAME_MS } from '../tokens/motion'
import type { AgentStateName } from '@/types/agentEvents'

// The agent's face: a 3×2 character grid, one state at a time. Extracted from the
// shell's avatar so widgets, loading states and overlays can wear the same face.
//
// The wire contract has 7 states; `acting` and `waiting` render as thinking art
// until the team ships real frames for them (docs/AI-Core/07-api-flow.md). When real
// art arrives, swap this file — the props are the contract.

export interface Face {
  /** Exactly 3 characters, e.g. "o o". */
  eyes: string
  /** One character. */
  mouth: string
}

const SPIN = ['|', '/', '-', '\\'] as const
const MOUTHS = ['o', '-', 'O', '-'] as const

/** The face at rest for each state, before any per-frame animation. */
export const FACES: Record<AgentStateName, Face> = {
  idle: { eyes: 'o o', mouth: '-' },
  listening: { eyes: 'O O', mouth: '.' },
  thinking: { eyes: '| |', mouth: '-' },
  acting: { eyes: '| |', mouth: '-' }, // thinking art until real frames exist
  waiting: { eyes: '| |', mouth: '.' }, // thinking art until real frames exist
  speaking: { eyes: 'o o', mouth: 'o' },
  error: { eyes: 'x x', mouth: '~' },
}

const BLINK: Face = { eyes: '- -', mouth: '-' }

/** Two lines, eyes over mouth. */
export function faceLines({ eyes, mouth }: Face): string {
  return `${eyes}\n ${mouth} `
}

/** Random wait before the next blink: 4 to 7 seconds. */
export const nextBlinkMs = () => 4000 + Math.random() * 3000

export interface AsciiFaceProps {
  status: AgentStateName
  reduced?: boolean
  className?: string
}

/**
 * The state-driven face. Thinking (and acting/waiting) spins the eyes, speaking moves
 * the mouth, idle and listening blink irregularly — every loop stops the instant the
 * state changes. Decorative: the accessible name is the caller's job.
 */
export function AsciiFace({ status, reduced: forced, className }: AsciiFaceProps) {
  const hookReduced = useReducedMotion()
  const reduced = forced ?? hookReduced
  const [face, setFace] = useState<Face>(FACES[status])

  useEffect(() => {
    const base = FACES[status]
    setFace(base)
    if (reduced) return

    // Thinking spins the eyes; speaking moves the mouth. Both stop the moment the state does.
    if (status === 'thinking' || status === 'acting' || status === 'waiting' || status === 'speaking') {
      let n = 0
      const id = window.setInterval(() => {
        n++
        setFace(
          status === 'speaking'
            ? { eyes: base.eyes, mouth: MOUTHS[n % MOUTHS.length] }
            : { eyes: `${SPIN[n % 4]} ${SPIN[n % 4]}`, mouth: base.mouth },
        )
      }, FRAME_MS)
      return () => window.clearInterval(id)
    }

    // Idle and listening blink now and then: quick, irregular, never a slow loop.
    if (status === 'idle' || status === 'listening') {
      let id = 0
      const schedule = () => {
        id = window.setTimeout(() => {
          setFace(BLINK)
          id = window.setTimeout(() => {
            setFace(base)
            schedule()
          }, 140)
        }, nextBlinkMs())
      }
      schedule()
      return () => window.clearTimeout(id)
    }
  }, [status, reduced])

  return (
    <pre className={className ?? 'nx-face'} aria-hidden="true">
      {faceLines(face)}
    </pre>
  )
}
