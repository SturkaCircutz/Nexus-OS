import { useEffect, useState } from 'react'
import type { AgentStatus } from '../agent/agentStore'
import { BLINK, FACES, FRAME_MS, MOUTHS, SPIN, faceLines, nextBlinkMs, type Face } from './frames'

export interface AvatarArtProps {
  status: AgentStatus
  reduced: boolean
}

/**
 * The avatar's picture. This is the slot for the real art: swap this component and keep
 * the props. It must stay decorative; AgentAvatar carries the accessible name.
 */
export function AvatarArt({ status, reduced }: AvatarArtProps) {
  const [face, setFace] = useState<Face>(FACES[status])

  useEffect(() => {
    const base = FACES[status]
    setFace(base)
    if (reduced) return

    // Thinking spins the eyes; speaking moves the mouth. Both stop the moment the state does.
    if (status === 'thinking' || status === 'speaking') {
      let n = 0
      const id = window.setInterval(() => {
        n++
        setFace(
          status === 'thinking'
            ? { eyes: `${SPIN[n % 4]} ${SPIN[n % 4]}`, mouth: base.mouth }
            : { eyes: base.eyes, mouth: MOUTHS[n % MOUTHS.length] },
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
    <pre className="nx-avatar-art" aria-hidden="true">
      {faceLines(face)}
    </pre>
  )
}
