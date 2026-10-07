/**
 * An ore cell's drill rule by its class (`registries/oreDrillClasses.ts`; #142, amended 6 Oct;
 * #232, #236), always on the cell's own tier, never its sale tier:
 *
 * - a drill-gated signature is as hard as `H(t + 5)` with a scratch floor of 1, so the tip needs
 *   `P >= H` and below that only skids;
 * - a dense cell keeps its tier's hardness with the floor `drill.denseScratchFloor`;
 * - every other cell keeps its tier's hardness and the global floor.
 *
 * #142 calls signatures drill-gated before the first extractor; `mining-gates` names which ones
 * are. With no class provider and no signature tag registered every cell is ordinary, and nothing
 * here asks the ore catalogue.
 */
import { ECONOMY } from '../economy/economy'
import { oreHardness, signatureHardness } from '../economy/oreEconomy'
import type { BigStat } from '../money'
import {
  hasOreDrillClasses,
  oreDrillClassOf,
  type OreDrillClass,
} from '../registries/oreDrillClasses'
import { hasOreSignatureTags, oreTypeOf } from '../registries/oreTypes'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import { resourceTierOf } from './minedOre'

/** An ore cell's hardness: its tier's, or `H(t + 5)` for a drill-gated signature. */
export function oreCellHardness(params: PlanetParams, tile: TilePoint, cell: number): BigStat {
  const tier = resourceTierOf(params, cell)
  return drillClassOfCell(params, tile, cell) === 'signature'
    ? signatureHardness(tier)
    : oreHardness(tier)
}

/** The tip-to-hardness ratio below which the drill only skids on this cell. */
export function scratchFloorOfCell(params: PlanetParams, tile: TilePoint, cell: number): BigStat {
  return SCRATCH_FLOORS[drillClassOfCell(params, tile, cell)]
}

/** The class of the ore in the cell; `ordinary` for any other cell. */
export function drillClassOfCell(
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): OreDrillClass {
  if (kindOfCell(cell) !== CELL_KIND.ore) return 'ordinary'
  if (!hasOreDrillClasses() && !hasOreSignatureTags()) return 'ordinary'
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  return oreDrillClassOf({ params, tile, ore })
}

const SCRATCH_FLOORS: Readonly<Record<OreDrillClass, BigStat>> = {
  ordinary: ECONOMY.drill.scratchFloor,
  dense: ECONOMY.drill.denseScratchFloor,
  signature: ECONOMY.drill.gateScratchFloor,
}
