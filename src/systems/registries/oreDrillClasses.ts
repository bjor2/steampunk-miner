/**
 * How the drill rule treats an ore cell (#142 "Drill tier per resourceTier", #236): the slice that
 * knows a cell's gate (`mining-gates`) names its class, and the kernel owns what each class means
 * (`authority/signatureCells.ts`), always on the cell's own tier, never its sale tier.
 *
 * - `ordinary`: its tier's hardness and the global floor `drill.scratchFloor`.
 * - `dense`: its tier's hardness and `drill.denseScratchFloor`, so the tip of the last completed
 *   major must be one level past the cell's tier (`minTipLevel = t + 1`).
 * - `signature`: a drill-gated signature, `H(t + 5)` with `drill.gateScratchFloor`.
 *
 * One provider. With none, a signature-tagged ore is `signature` and every other `ordinary`, as
 * #232 shipped it.
 */
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import type { OreType } from './oreTypes'
import { defineOneProviderRegistry, entriesOf } from './seal'

export type OreDrillClass = 'ordinary' | 'dense' | 'signature'

/** An ore cell as the drill meets it: where it lies and which ore it holds. */
export interface OreDrillClassQuery {
  params: PlanetParams
  tile: TilePoint
  ore: OreType
}

export interface OreDrillClassProvider {
  id: string
  drillClassOf(query: OreDrillClassQuery): OreDrillClass
}

export const ORE_DRILL_CLASS_REGISTRY =
  defineOneProviderRegistry<OreDrillClassProvider>('oreDrillClasses')

/** Whether a slice classes ore cells; with none, only a signature tag makes a cell anything else. */
export function hasOreDrillClasses(): boolean {
  return entriesOf(ORE_DRILL_CLASS_REGISTRY).length > 0
}

/** The provider's class, else `signature` for a signature-tagged ore and `ordinary` otherwise. */
export function oreDrillClassOf(query: OreDrillClassQuery): OreDrillClass {
  const [provider] = entriesOf(ORE_DRILL_CLASS_REGISTRY)
  if (provider !== undefined) return provider.drillClassOf(query)
  return query.ore.signature === true ? 'signature' : 'ordinary'
}
