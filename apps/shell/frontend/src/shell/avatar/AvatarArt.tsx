import type { AgentStatus } from '../agent/agentStore'
import { OrbitArt } from './OrbitArt'

export interface AvatarArtProps {
  status: AgentStatus
  reduced: boolean
}

/**
 * The avatar's picture: the ORBIT orb (see `orbitEngine.ts`). The ASCII face
 * (`AsciiFace` in the UI library) stays available for widgets and overlays; this
 * is the slot for the shell's real art. It must remain decorative — AgentAvatar
 * carries the accessible name.
 */
export function AvatarArt({ status, reduced }: AvatarArtProps) {
  return <OrbitArt status={status} reduced={reduced} />
}
