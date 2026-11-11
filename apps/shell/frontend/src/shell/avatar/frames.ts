// The stand-in avatar: a 3×2 ASCII face. Each agent state picks its eyes and mouth.
// When the team's real art arrives, only AvatarArt.tsx (and this file) change.

import type { AgentStatus } from '../agent/agentStore'

export const SPIN = ['|', '/', '-', '\\'] as const
export const MOUTHS = ['o', '-', 'O', '-'] as const
/** Frame time for the spinner eyes and the talking mouth. */
export const FRAME_MS = 110

export interface Face {
  /** Exactly 3 characters, e.g. "o o". */
  eyes: string
  /** One character. */
  mouth: string
}

/** The face at rest for each state, before any per-frame animation. */
export const FACES: Record<AgentStatus, Face> = {
  idle: { eyes: 'o o', mouth: '-' },
  listening: { eyes: 'O O', mouth: '.' },
  thinking: { eyes: '| |', mouth: '-' },
  speaking: { eyes: 'o o', mouth: 'o' },
  error: { eyes: 'x x', mouth: '~' },
}

export const BLINK: Face = { eyes: '- -', mouth: '-' }

/** Two lines, eyes over mouth. The avatar's glass button is the head, so no ASCII box. */
export function faceLines({ eyes, mouth }: Face): string {
  return `${eyes}\n ${mouth} `
}

/** Random wait before the next blink: 4 to 7 seconds. */
export const nextBlinkMs = () => 4000 + Math.random() * 3000
