/**
 * A blast is a disturbance for the collapse rules (spec #109 "Collapse risk", #43): every collapse
 * block whose centre lies within one block of the blast's radius is checked at once, and each weak
 * one not already collapsing starts its telegraph, as the watch starts any other. Lining is never
 * blasted away, so blocks whose lining holds stay quiet as usual.
 */
import { COLLAPSE_BLOCK_SAMPLES } from '../../../constants/balance'
import { blastRadiusMm } from '../../economy/blastingCharges'
import { chargeCentreMm } from '../../vehicle/vehicleCharges'
import { blockIdOf, blocksNear, type CollapseBlock } from '../../world/collapseBlock'
import { weaknessOfBlock } from '../../world/collapseWeakness'
import type { PlanetParams } from '../../world/planetParams'
import { MM_PER_SAMPLE } from '../../world/sampleGrid'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import { entryOfBlock } from '../collapse/collapseState'
import { startWarning, type WeakBlock } from '../collapse/collapseWatch'
import { chainEffects, type RuleEffect } from '../commandRule'

const BLOCK_SIDE_MM = COLLAPSE_BLOCK_SAMPLES * MM_PER_SAMPLE

export interface BlastCollapseCheck {
  effect: RuleEffect
  /** Blocks checked. */
  checks: number
  /** Warnings the blast started. */
  triggered: number
}

export function checkCollapseNearBlast(
  state: AuthorityState,
  params: PlanetParams,
  charge: TilePoint,
): BlastCollapseCheck {
  const blocks = blocksNear(chargeCentreMm(charge), blastRadiusMm() + BLOCK_SIDE_MM)
  const fresh = freshWeakBlocksAmong(state, params, blocks)
  const effect = chainEffects(
    state,
    fresh.map((weak) => (current: AuthorityState) => startWarning(current, weak, false)),
  )
  return { effect, checks: blocks.length, triggered: fresh.length }
}

/** The weak blocks among `blocks` that are not collapsing yet. */
function freshWeakBlocksAmong(
  state: AuthorityState,
  params: PlanetParams,
  blocks: readonly CollapseBlock[],
): WeakBlock[] {
  return blocks.flatMap((block) => {
    const weakness = weaknessOfBlock(state.world, params, block)
    const isCollapsing = entryOfBlock(state.collapse, blockIdOf(block)) !== null
    return weakness === null || isCollapsing ? [] : [{ block, weakness }]
  })
}
