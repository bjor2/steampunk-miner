/**
 * Where the bay screen's shutter stands, written by `PlatformScreen` as it opens and closes (#45),
 * so the debug API can report it. Presentation only: never a command, a log line or the digest.
 */
import type { BayId } from '../../systems/world/dockBays'
import type { BayTransition } from '../../systems/views/bayPresentation'

export type BayScreenPhase = 'closed' | 'opening' | 'open' | 'closing'

export const bayScreenPresence: {
  bay: BayId | null
  phase: BayScreenPhase
  transition: BayTransition | null
} = { bay: null, phase: 'closed', transition: null }
