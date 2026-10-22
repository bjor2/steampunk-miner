/**
 * Gated cells are never cased (GD lock on #661): with the ring in the rock just outside the bore,
 * an ore cell the slices' gates keep standing against this player's drill (`refused` or
 * `blocked`, as `drillGates.ts` reads them) borders the wall it would line. Its samples are left
 * out of the ring, so the cell stays the plain ore the gate stands on. With no check registered
 * the ring is today's, and nothing here builds an ore query.
 */
import { hasGateChecks, isStandingVerdict } from '../registries/gateChecks'
import { ringSamplesOf, type CasingRing } from '../world/casingLining'
import { tileOfSample } from '../world/groundEditSession'
import type { PlanetParams } from '../world/planetParams'
import type { WeightedSample } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { materialCellAt } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import { gateOfCell, type CellGates, type GateAsker } from './cellGates'

/** The ring's samples outside every cell a gate keeps standing against `playerId`'s drill. */
export function casableRingSamplesOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  ring: CasingRing,
): WeightedSample[] {
  const samples = ringSamplesOf(ring)
  if (!hasGateChecks()) return samples
  const isGated = gatedTileQueryOf({ state, playerId, params, blast: null })
  return samples.filter((sample) => !isGated(tileOfSample(sample)))
}

/** Whether a gate keeps the tile's cell standing, asked once per tile. */
function gatedTileQueryOf(asker: GateAsker): (tile: TilePoint) => boolean {
  const gates: CellGates = new Map()
  return (tile) => {
    const cell = materialCellAt(asker.state.world, asker.params, tile)
    const gated = gateOfCell(gates, asker, { tile, cell })
    return gated !== null && isStandingVerdict(gated.verdict)
  }
}
