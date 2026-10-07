/**
 * The showcase's part motion (#180 section 1): the kernel's part motion presence asks this once per
 * fixed step, and it answers each track's playing reaction as poses on that track's own slots,
 * plus the parts the owned milestones swap in. The poses live in one kept request per move, so a
 * step allocates nothing; the swaps are rebuilt only when the levels change.
 */
import { readAuthorityTick, readLocalVehicle } from '../../../store/gameStore'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import type { UpgradeLevels } from '../../../systems/economy/vehicleStats'
import type {
  PartMotionRequest,
  PartMotionRequestSource,
  PartPoseRequest,
  PartSwapRequest,
} from '../../../systems/registries/partMotionRequests'
import { NO_MILESTONES, ownedSwapsOf } from '../systems/milestoneLandings'
import type { StepReaction } from '../systems/liveHold'
import { momentTicksOf, SHOWCASE, swingMoveAt } from '../systems/render/showcaseReactions'
import { useWorkshopStore } from '../store/workshopStore'

const POSES: Readonly<Record<UpgradeId, readonly PartPoseRequest[]>> = Object.fromEntries(
  Object.entries(SHOWCASE.tracks).map(([track, reaction]) => [
    track,
    reaction.moves.map((move) => restingPoseOf(reaction.attach, move.slots)),
  ]),
) as Record<UpgradeId, PartPoseRequest[]>

const shown: PartMotionRequest[] = []
const swaps = { levels: null as UpgradeLevels | null, requests: [] as PartSwapRequest[] }

export const SHOWCASE_PART_MOTION: PartMotionRequestSource = {
  id: 'workshop.showcase',
  requestsNow() {
    shown.length = 0
    const tick = readAuthorityTick()
    for (const reaction of useWorkshopStore.getState().reactions) showReactionAt(reaction, tick)
    showOwnedSwaps(readLocalVehicle().levels)
    return shown
  },
}

function restingPoseOf(
  attach: PartPoseRequest['attach'],
  slots: readonly string[],
): PartPoseRequest {
  return { kind: 'pose', attach, slots, x: 0, y: 0, angle: 0, glow: 0 }
}

function showReactionAt(reaction: StepReaction, tick: number): void {
  const age = tick - reaction.startTick
  if (age < 0 || age >= momentTicksOf(reaction.moment)) return
  const moves = SHOWCASE.tracks[reaction.upgradeId].moves
  const poses = POSES[reaction.upgradeId]
  for (let at = 0; at < moves.length; at++) {
    swingMoveAt(moves[at], reaction.moment, age, poses[at])
    shown.push(poses[at])
  }
}

function showOwnedSwaps(levels: UpgradeLevels): void {
  if (levels !== swaps.levels) rebuildSwaps(levels)
  for (const request of swaps.requests) shown.push(request)
}

function rebuildSwaps(levels: UpgradeLevels): void {
  swaps.levels = levels
  swaps.requests = ownedSwapsOf(levels, NO_MILESTONES).map(({ track, partIds }) => ({
    kind: 'swap',
    attach: SHOWCASE.tracks[track].attach,
    partIds,
  }))
}
