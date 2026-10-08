/**
 * Which blocks warn (decision #43 Rule and Sequence 1, Technical Director's build notes 1-2):
 * after every accepted command (`collapseFollow.ts`), against the ground and the vehicles as they
 * now stand,
 *
 * 1. a warning whose block is no longer weak (relined, or its weak lining drilled away) or has no
 *    vehicle's body centre within 16 m any more is cancelled (`CollapseCancelled`); coming back
 *    later starts a full new warning;
 * 2. every weak block within 16 m of a vehicle that is not already collapsing starts its 60-tick
 *    telegraph (`CollapseWarned`).
 *
 * Only blocks near a vehicle are ever looked at, so far tunnels stay frozen in the save. Blocks are
 * visited in `chunkKey`, then block-index order, so every machine logs the same sequence.
 */
import { COLLAPSE_ACTIVE_RADIUS_MM } from '../../../constants/balance'
import { requiredCasingGrade } from '../../economy/casingGrades'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import {
  blockCentreMm,
  blockIdOf,
  blocksNear,
  isBlockCentreWithin,
  sortBlocks,
  type CollapseBlock,
} from '../../world/collapseBlock'
import { casingBandOfTile } from '../../world/casingBand'
import { weaknessOfBlock, type BlockWeakness } from '../../world/collapseWeakness'
import type { BodyCentre } from '../../world/collapseRefill'
import type { PlanetParams } from '../../world/planetParams'
import { withCollapse, type AuthorityState } from '../authorityState'
import { chainEffects, type RuleEffect } from '../commandRule'
import {
  blockOfEntry,
  entryOfBlock,
  isWarningAt,
  withCollapsingBlock,
  withoutCollapsingBlock,
  type CollapsingBlock,
} from './collapseState'

/** A vehicle's body centre, with whose it is. */
export interface VehicleBody {
  playerId: string
  centre: BodyCentre
}

export interface WeakBlock {
  block: CollapseBlock
  weakness: BlockWeakness
}

/** A forced block always holds; any other only while weak with a vehicle within 16 m. */
export function isCollapseHeld(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
): boolean {
  if (entry.isForced) return true
  const block = blockOfEntry(entry)
  return isNearAnyVehicle(state, block) && weaknessOfBlock(state.world, params, block) !== null
}

export function cancelCollapse(state: AuthorityState, id: string): RuleEffect {
  return {
    state: withCollapse(state, withoutCollapsingBlock(state.collapse, id)),
    events: [{ type: 'CollapseCancelled', block: id }],
  }
}

/** Starts a block's telegraph at the state's tick and says so. */
export function startWarning(
  state: AuthorityState,
  weak: WeakBlock,
  isForced: boolean,
): RuleEffect {
  const block = blockIdOf(weak.block)
  const entry = { block, startTick: state.tick, isForced }
  return {
    state: withCollapse(state, withCollapsingBlock(state.collapse, entry)),
    events: [{ type: 'CollapseWarned', block, ...weak.weakness }],
  }
}

/** Every weak block within 16 m of some vehicle, in processing order. */
export function weakBlocksNearVehicles(state: AuthorityState, params: PlanetParams): WeakBlock[] {
  return blocksNearVehicles(state).flatMap((block) => {
    const weakness = weaknessOfBlock(state.world, params, block)
    return weakness === null ? [] : [{ block, weakness }]
  })
}

/**
 * What a forced block's warning reports: its real weakness, or, when its lining holds, the band at
 * its centre with grade 0.
 */
export function forcedWeaknessOf(
  state: AuthorityState,
  params: PlanetParams,
  block: CollapseBlock,
): BlockWeakness {
  const weakness = weaknessOfBlock(state.world, params, block)
  if (weakness !== null) return weakness
  const centre = blockCentreMm(block)
  const { tx, ty } = tileOfMillimetres(centre.xMm, centre.yMm)
  const band = casingBandOfTile(params, tx, ty)
  return { band, weakestGrade: 0, required: requiredCasingGrade(band) }
}

/** Every vehicle with a pose, in player id order. */
export function vehicleBodiesOf(state: AuthorityState): VehicleBody[] {
  return Object.keys(state.players)
    .sort()
    .flatMap((playerId) => {
      const { pose } = state.players[playerId].vehicle
      return pose === null ? [] : [{ playerId, centre: { xMm: pose.x, yMm: pose.y } }]
    })
}

/** Sequence 1: every warning whose block no longer holds is cancelled. */
export function cancelUnheldWarnings(state: AuthorityState, params: PlanetParams): RuleEffect {
  const dropped = state.collapse.blocks.filter(
    (entry) => isWarningAt(entry, state.tick) && !isCollapseHeld(state, params, entry),
  )
  return chainEffects(
    state,
    dropped.map((entry) => (current: AuthorityState) => cancelCollapse(current, entry.block)),
  )
}

/** Sequence 2: every weak block near a vehicle not already collapsing starts its telegraph. */
export function warnWeakBlocksNearVehicles(
  state: AuthorityState,
  params: PlanetParams,
): RuleEffect {
  const fresh = weakBlocksNearVehicles(state, params).filter(
    ({ block }) => entryOfBlock(state.collapse, blockIdOf(block)) === null,
  )
  return chainEffects(
    state,
    fresh.map((weak) => (current: AuthorityState) => startWarning(current, weak, false)),
  )
}

function blocksNearVehicles(state: AuthorityState): CollapseBlock[] {
  const near = new Map<string, CollapseBlock>()
  for (const { centre } of vehicleBodiesOf(state)) {
    for (const block of blocksNear(centre, COLLAPSE_ACTIVE_RADIUS_MM)) {
      near.set(blockIdOf(block), block)
    }
  }
  return sortBlocks([...near.values()])
}

function isNearAnyVehicle(state: AuthorityState, block: CollapseBlock): boolean {
  return vehicleBodiesOf(state).some(({ centre }) =>
    isBlockCentreWithin(block, centre, COLLAPSE_ACTIVE_RADIUS_MM),
  )
}
