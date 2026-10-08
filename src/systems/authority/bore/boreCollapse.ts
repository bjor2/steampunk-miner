/**
 * The bore-disturbance collapse hook (ticket 313, the GD's whole-block refill on #309): at the
 * bore's end plus its hold, each 4x4 m block holding a bored tile is checked once, nearest the
 * rig's firing point first, at most `BLAST_COLLAPSE_CHECKS_PER_TICK` a tick as a blast's rim is
 * (`blastCollapse.ts`). A block the bore's own rule finds weak (`boreWeakness.ts`) and not already
 * collapsing starts the existing warning through `startWarning`, so the dust telegraph, the
 * 60-tick warning, the 30-tick refill of all the block's carved air, the crush and the vehicle
 * clearance stay #43's.
 *
 * Its warning is a forced one (the TD's ruling on #313), reported as `forcedWeaknessOf` reports
 * one: the check was made once, at the bore's end, and #57's watch would cancel it the next tick
 * (no vehicle within 16 m, or unlined walls it ignores), so it holds to the refill wherever the
 * rig goes. A block lined at the required grade was never warned at all.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { BLAST_COLLAPSE_CHECKS_PER_TICK } from '../../../constants/terrainBudget'
import type { IntegerVector } from '../../vehicle/vehiclePose'
import {
  blockCentreMm,
  blockContaining,
  blockIdOf,
  compareBlocks,
  type CollapseBlock,
} from '../../world/collapseBlock'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'
import { entryOfBlock } from '../collapse/collapseState'
import { forcedWeaknessOf, startWarning, type WeakBlock } from '../collapse/collapseWatch'
import { chainEffects, type RuleEffect } from '../commandRule'
import type { PendingBore } from './boreState'
import { boreWeaknessOf } from './boreWeakness'

/** A block the bore crossed, with the bored tiles inside it. */
export interface DisturbedBlock {
  block: CollapseBlock
  tiles: TilePoint[]
}

export interface BoreCollapseCheck {
  effect: RuleEffect
  bore: PendingBore
}

/** Checks the bore's next blocks, up to the cap; the bore is done checking after its last. */
export function checkBoreBlocks(
  state: AuthorityState,
  params: PlanetParams,
  bore: PendingBore,
): BoreCollapseCheck {
  const disturbed = disturbedBlocksOf(bore)
  const due = disturbed.slice(
    bore.blocksChecked,
    bore.blocksChecked + BLAST_COLLAPSE_CHECKS_PER_TICK,
  )
  const fresh = freshWeakBlocksAmong(state, params, due)
  const effect = chainEffects(
    state,
    fresh.map((weak) => (current: AuthorityState) => startWarning(current, weak, true)),
  )
  return { effect, bore: afterChecks(bore, due.length, disturbed.length) }
}

/** Every block holding a bored tile, nearest the firing point first, ties in block order. */
export function disturbedBlocksOf(bore: PendingBore): DisturbedBlock[] {
  const byId = new Map<string, DisturbedBlock>()
  for (const tile of bore.bored) {
    const block = blockContaining(tileCentreMm(tile))
    const known = byId.get(blockIdOf(block))
    if (known === undefined) byId.set(blockIdOf(block), { block, tiles: [tile] })
    else known.tiles.push(tile)
  }
  return [...byId.values()].sort((a, b) => compareNearest(bore.origin, a.block, b.block))
}

function afterChecks(bore: PendingBore, checked: number, total: number): PendingBore {
  const blocksChecked = bore.blocksChecked + checked
  return { ...bore, blocksChecked, checkTick: blocksChecked >= total ? null : bore.checkTick }
}

function freshWeakBlocksAmong(
  state: AuthorityState,
  params: PlanetParams,
  due: readonly DisturbedBlock[],
): WeakBlock[] {
  return due
    .filter(({ block, tiles }) => isFreshWeakBlock(state, params, block, tiles))
    .map(({ block }) => ({ block, weakness: forcedWeaknessOf(state, params, block) }))
}

/** The bore's own rule finds the block weak, and it is not collapsing already. */
function isFreshWeakBlock(
  state: AuthorityState,
  params: PlanetParams,
  block: CollapseBlock,
  tiles: readonly TilePoint[],
): boolean {
  const isCollapsing = entryOfBlock(state.collapse, blockIdOf(block)) !== null
  return !isCollapsing && boreWeaknessOf(state.world, params, tiles) !== null
}

function compareNearest(origin: IntegerVector, a: CollapseBlock, b: CollapseBlock): number {
  return distanceSqMm(origin, a) - distanceSqMm(origin, b) || compareBlocks(a, b)
}

function distanceSqMm(origin: IntegerVector, block: CollapseBlock): number {
  const centre = blockCentreMm(block)
  const dx = centre.xMm - origin.x
  const dy = centre.yMm - origin.y
  return dx * dx + dy * dy
}

function tileCentreMm(tile: TilePoint): { xMm: number; yMm: number } {
  const half = MM_PER_METRE / 2
  return { xMm: tile.tx * MM_PER_METRE + half, yMm: tile.ty * MM_PER_METRE + half }
}
