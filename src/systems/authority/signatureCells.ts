/**
 * A signature ore cell's drill rule (#142, amended 6 Oct; kept by #232): `H(t + 5)` hardness on
 * the cell's own tier, never its sale tier, and a scratch floor of 1, so the tip needs `P >= H`
 * and below that only skids. Every other cell keeps its tier's hardness and the global floor.
 *
 * #142 calls these drill-gated signatures: the signatures before the first extractor (P3-P4),
 * and so every signature while no extractor exists. With no signature tag registered no cell is a
 * signature, and nothing here asks the ore catalogue.
 */
import { ECONOMY } from '../economy/economy'
import { oreHardness, signatureHardness } from '../economy/oreEconomy'
import type { BigStat } from '../money'
import { hasOreSignatureTags, oreTypeOf } from '../registries/oreTypes'
import type { PlanetParams } from '../world/planetParams'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import { resourceTierOf } from './minedOre'

/** An ore cell's hardness: its tier's, or `H(t + 5)` for a signature. */
export function oreCellHardness(params: PlanetParams, cell: number): BigStat {
  const tier = resourceTierOf(params, cell)
  return isSignatureOreCell(params, cell) ? signatureHardness(tier) : oreHardness(tier)
}

/** The tip-to-hardness ratio below which the drill only skids on this cell. */
export function scratchFloorOfCell(params: PlanetParams, cell: number): BigStat {
  const { drill } = ECONOMY
  return isSignatureOreCell(params, cell) ? drill.gateScratchFloor : drill.scratchFloor
}

/** Whether the cell holds an ore a signature tag claims. */
export function isSignatureOreCell(params: PlanetParams, cell: number): boolean {
  if (!hasOreSignatureTags()) return false
  if (kindOfCell(cell) !== CELL_KIND.ore) return false
  const query = { tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) }
  return oreTypeOf(query).signature === true
}
