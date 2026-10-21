/** What each track of the local player's rig shows now, as their replica holds it (the debug read). */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { rigLookIndexOf } from '../systems/render/rigLookIndex'
import type { TrackLookFrames } from '../systems/render/rigLookFrames'
import { ownedPurchasesOf, rigLookOfPlayer } from '../systems/rigLookSource'
import { SHIPPED_RIG_LOOKS } from '../systems/rigLooks'

export interface RigLookReading {
  track: string
  purchases: number
  step: number
  tail: number
  partId: string | null
  /** The asset `partId` is cut from (ticket 640), null with no part. */
  assetId: string | null
  /** The glow colour, null on the base look. */
  tint: string | null
  plating: string | null
}

export function readRigLookReadings(): RigLookReading[] {
  const state = readAuthorityState()
  const playerId = useGameStore.getState().playerId
  return SHIPPED_RIG_LOOKS.tracks.map((frames) => readingOf(frames, state, playerId))
}

function readingOf(
  frames: TrackLookFrames,
  state: AuthorityState,
  playerId: string,
): RigLookReading {
  const purchases = ownedPurchasesOf(state, playerId, frames.rows.track)
  const { partId, assetId, tint, plating } = rigLookOfPlayer(frames, state, playerId)
  const index = rigLookIndexOf(frames.rows, purchases)
  return { track: frames.rows.track, purchases, ...index, partId, assetId, tint, plating }
}
