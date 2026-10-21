/**
 * The rig look's part swaps on the drawn car (#577): the kernel's part motion presence asks this
 * once per fixed step. It reads the local vehicle's owned levels (the scene draws only that car),
 * and asks which attach points a mounted module or item holds only while an owned look has a part,
 * so a rig with no look parts costs one pass over its tracks and allocates nothing. While one has
 * a part, the taken points are read from `mountedPartsShown()`, which copies its list each step;
 * the drill tip's steps have parts from 70 purchases (ticket 579), the other tracks' rows once
 * their wiring tickets land the art.
 */
import { mountedPartsShown } from '../../../scene/mountedPartsPresence'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type {
  PartMotionRequest,
  PartMotionRequestSource,
} from '../../../systems/registries/partMotionRequests'
import type { RigLookFrame } from '../systems/render/rigLookFrames'
import { isSwappingParts, partSwapsOf } from '../systems/render/rigLookParts'
import { rigLookOfPlayer } from '../systems/rigLookSource'
import { SHIPPED_RIG_LOOKS } from '../systems/rigLooks'

const NO_SWAPS: readonly PartMotionRequest[] = []
const owned: RigLookFrame[] = []

export const RIG_LOOK_PART_SWAPS: PartMotionRequestSource = {
  id: 'rig-look.part-swaps',
  requestsNow() {
    readOwnedLooks()
    if (!isSwappingParts(owned)) return NO_SWAPS
    return partSwapsOf(owned, takenPointsNow())
  },
}

function readOwnedLooks(): void {
  const state = readAuthorityState()
  const playerId = useGameStore.getState().playerId
  owned.length = 0
  for (const frames of SHIPPED_RIG_LOOKS.tracks)
    owned.push(rigLookOfPlayer(frames, state, playerId))
}

function takenPointsNow(): string[] {
  return mountedPartsShown().map((mount) => mount.attachId)
}
