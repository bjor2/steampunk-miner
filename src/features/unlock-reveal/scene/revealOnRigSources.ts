/**
 * The reveal on the drawn car (ticket 718): the vehicle look that glows the bought part, asked by
 * the kernel every frame, and the part swap that hangs it at its point while the rig does not draw
 * it, asked once per fixed step. Both read the reveal store and allocate nothing per call: the glow
 * slots and the swap are worked out once per reveal and kept.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { vehicleOf } from '../../../systems/authority/authorityState'
import type {
  PartMotionRequest,
  PartMotionRequestSource,
} from '../../../systems/registries/partMotionRequests'
import type { VehicleLookSource } from '../../../systems/registries/vehicleLooks'
import { useRevealStore } from '../store/revealStore'
import {
  createRevealLook,
  glowSlotsOf,
  revealGlowAt,
  revealHangOf,
  revealLookAt,
  revealModelOf,
} from '../systems/render/revealOnRig'
import { isRevealPlayingAt, type UnlockReveal } from '../systems/unlockReveal'

const NO_REQUESTS: readonly PartMotionRequest[] = []

/** What one reveal shows on the car, worked out on its first ask. */
export interface RevealOnRig {
  reveal: UnlockReveal
  glowSlots: readonly string[]
  hang: readonly PartMotionRequest[]
}

let shown: RevealOnRig | null = null

const kept = createRevealLook()

export const REVEAL_LOOK: VehicleLookSource = {
  id: 'unlock-reveal.glow',
  lookOf(_state, _playerId, tick) {
    const onRig = revealOnRigAt(tick)
    if (onRig === null) return null
    const glow = revealGlowAt(onRig.reveal, tick, isMotionReduced())
    return revealLookAt(kept, onRig.glowSlots, glow)
  },
  flashOf: () => null,
}

export const REVEAL_HANG: PartMotionRequestSource = {
  id: 'unlock-reveal.hang',
  requestsNow() {
    return revealOnRigAt(readAuthorityState().tick)?.hang ?? NO_REQUESTS
  },
}

/** The playing reveal's glow and hang, or null while none plays at `tick`; the debug read too. */
export function revealOnRigAt(tick: number): RevealOnRig | null {
  const { reveal } = useRevealStore.getState()
  if (reveal === null || !isRevealPlayingAt(reveal, tick)) return null
  if (shown?.reveal !== reveal) shown = revealOnRigOf(reveal)
  return shown
}

function revealOnRigOf(reveal: UnlockReveal): RevealOnRig {
  const { item } = reveal.revealed
  const hang = revealHangOf(item, localLoadout())
  return {
    reveal,
    glowSlots: glowSlotsOf(revealModelOf(item, SHIPPED_ART)),
    hang: hang === null ? NO_REQUESTS : [hang],
  }
}

function localLoadout() {
  return vehicleOf(readAuthorityState(), useGameStore.getState().playerId).loadout
}

function isMotionReduced(): boolean {
  return !useGameStore.getState().prefs.shake
}
