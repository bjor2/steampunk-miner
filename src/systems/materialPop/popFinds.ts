/**
 * What option B pops for a carved cell (ticket 616, the final B bars on #442): the unit the drill
 * paid into the hold, keyed by its material and sized by its rarity step. The step is the unit's
 * tier over its band's own ore, as the pickup seam measures it (`groundDrill.ts`, `pickupFindOf`),
 * so the ladder follows the material table's tiers and no count or name is written here.
 *
 * A carved cell pops only when its unit reached the hold: a gated cell (`DrillGated`, the carry
 * discarded), a full hold's lost unit and bare ground carry no `CargoAdded`, so they pop nothing
 * (HS condition 3). Special blocks and artefacts take the `special` lane; no drilled cell is one
 * yet (#570 HS: "future ... special blocks"), so only the thinning rule meets that lane today.
 * Written into a caller's scratch, so a carved batch allocates nothing per pop.
 */
import { POP_GUARDED_STEP_MIN } from '../../constants/materialPop'
import type { DomainEvent } from '../authority/domainEvent'
import { oreTier } from '../economy/oreEconomy'
import { bandOfTile } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { CarvedCell } from './carveWatch'

/** Common pops merge and drop first; rare-or-better merge but never drop; specials neither. */
export type PopLane = 'common' | 'guarded' | 'special'

export interface PopFind {
  tx: number
  ty: number
  /** Pops of one material merge: the unit's ore id, or a special's own id. */
  materialId: string
  /** Tiers over the band's own ore, 0 for common; a lower ore moved in counts as common. */
  step: number
  lane: PopLane
  /** The tick its cell was carved. */
  tick: number
}

type CargoAdded = Extract<DomainEvent, { type: 'CargoAdded' }>

export function createPopFind(): PopFind {
  return { tx: 0, ty: 0, materialId: '', step: 0, lane: 'common', tick: 0 }
}

/** Writes the carved cell's pop into `out`; false when the cell sent nothing to the hold. */
export function readPopFind(cell: CarvedCell, params: PlanetParams, out: PopFind): boolean {
  const unit = unitOf(cell)
  if (unit === null) return false
  const step = rarityStepOf(params, cell, unit)
  out.tx = cell.tile.tx
  out.ty = cell.tile.ty
  out.materialId = unit.oreId
  out.step = step
  out.lane = laneOfStep(step)
  out.tick = cell.tick
  return true
}

export function laneOfStep(step: number): PopLane {
  return step >= POP_GUARDED_STEP_MIN ? 'guarded' : 'common'
}

export function copyPopFind(from: PopFind, to: PopFind): void {
  to.tx = from.tx
  to.ty = from.ty
  to.materialId = from.materialId
  to.step = from.step
  to.lane = from.lane
  to.tick = from.tick
}

function unitOf(cell: CarvedCell): CargoAdded | null {
  for (const event of cell.yieldEvents) if (event.type === 'CargoAdded') return event
  return null
}

function rarityStepOf(params: PlanetParams, cell: CarvedCell, unit: CargoAdded): number {
  const band = bandOfTile(params, cell.tile.tx, cell.tile.ty)
  return Math.max(0, unit.resourceTier - oreTier(params.planetIndex, band))
}
