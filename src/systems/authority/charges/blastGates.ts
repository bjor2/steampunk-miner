/**
 * The gate checks on the blast path (docs/standards/feature-slices.md 3.6, K2). A charge asks the
 * slices' gates about every ore cell in its radius, telling them the blast:
 *
 * - `refused`: the cell stands, as the anchors of #153's amendment (dense and rig-gated cells).
 * - `cut`: the gate opens to this charge, which frees the cell whole: its full ore unit, not the
 *   blast's kept share, and past the charge's hardness cap (#142 "Dynamite-only share per band").
 * - `lost`: the cell breaks and its ore is lost with the share the blast loses.
 *
 * A cell with no verdict takes today's blast. With no check registered nothing is asked.
 */
import type { BlastEvent } from '../../registries/blastEffects'
import { hasGateChecks } from '../../registries/gateChecks'
import type { YieldedCell } from '../../world/cellYield'
import type { PlanetParams } from '../../world/planetParams'
import type { AuthorityState } from '../authorityState'
import { gateOfCell, type CellGates, type GatedCell } from '../cellGates'

/** The gate's verdict on a cell in the blast, or null when the cell has no gate. */
export type BlastGateOf = (cell: YieldedCell) => GatedCell | null

/** What the blast does to an ore cell's ore: today's kept share, all of it, or none. */
export type BlastOreFate = 'shared' | 'whole' | 'lost'

export function blastGatesOf(
  state: AuthorityState,
  params: PlanetParams,
  blast: BlastEvent,
): BlastGateOf {
  if (!hasGateChecks()) return () => null
  const asker = { state, playerId: blast.playerId, params, blast }
  const gates: CellGates = new Map()
  return (cell) => gateOfCell(gates, asker, cell)
}

/** A gate that refuses the blast keeps the cell; any other verdict lets the blast break it. */
export function isStandingAgainstBlast(gated: GatedCell): boolean {
  return gated.verdict.outcome === 'refused'
}

export function blastOreFateOf(gated: GatedCell | null): BlastOreFate {
  if (gated === null) return 'shared'
  return gated.verdict.outcome === 'cut' ? 'whole' : 'lost'
}
