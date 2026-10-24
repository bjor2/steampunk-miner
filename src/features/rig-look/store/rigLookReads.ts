/** What each track of the local player's rig shows now, as their replica holds it (the debug read). */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { rigLookIndexOf } from '../systems/render/rigLookIndex'
import type { TrackLookFrames } from '../systems/render/rigLookFrames'
import { plaqueFactOf } from '../systems/rigLookPlaque'
import { ownedPurchasesOf, rigLookOfPlayer } from '../systems/rigLookSource'
import { SHIPPED_RIG_LOOKS } from '../systems/rigLooks'

export interface RigLookReading {
  track: string
  purchases: number
  /** The band the purchases sit in (ticket 809), 0 below the first edge. */
  band: number
  step: number
  tail: number
  /** Decades of power the finish badge shows as pips, 0 on an authored band. */
  pips: number
  partId: string | null
  /** The asset `partId` is cut from (ticket 640), null with no part. */
  assetId: string | null
  /** The glow colour, null on the base look. */
  tint: string | null
  /** The finish a band past the art wears (ticket 809), null on the authored steps. */
  finish: string | null
  /** The Outfitter hover line (`Fitting: …`), null on a track without one or below its edge. */
  fitting: string | null
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
  const { partId, assetId, tint, finish } = rigLookOfPlayer(frames, state, playerId)
  const index = rigLookIndexOf(frames.rows, purchases)
  const fitting = plaqueFactOf(frames, purchases)
  return { track: frames.rows.track, purchases, ...index, partId, assetId, tint, finish, fitting }
}
