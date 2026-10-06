/**
 * The gate checks on the drill path (docs/standards/feature-slices.md 3.6, #142's `canMine`): for
 * ore cells only, a `refused` verdict makes the cell undrillable and a `lost` one destroys it
 * without cargo. With no check registered the drill keeps today's path exactly, so nothing here
 * builds an ore query then.
 */
import { gateVerdictOf, hasGateChecks, type GateOutcome } from '../registries/gateChecks'
import { oreTypeOf } from '../registries/oreTypes'
import type { CellDrillTicks } from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import type { AuthorityState } from './authorityState'
import { resourceTierOf } from './minedOre'

/** `drillTicksOf`, answering null (not drillable) for an ore cell a gate refuses. */
export function gatedDrillTicks(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  drillTicksOf: CellDrillTicks,
): CellDrillTicks {
  if (!hasGateChecks()) return drillTicksOf
  return (tile, material, casingGrade) =>
    gateOutcomeOfCell(state, playerId, params, tile, material) === 'refused'
      ? null
      : drillTicksOf(tile, material, casingGrade)
}

/** Whether a gate says the yielded cell is destroyed without paying its cargo. */
export function isYieldLostToGate(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): boolean {
  return hasGateChecks() && gateOutcomeOfCell(state, playerId, params, tile, cell) === 'lost'
}

/** The gates' verdict on an ore cell; `cut` for any other cell or when no gate has an opinion. */
function gateOutcomeOfCell(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): GateOutcome {
  if (kindOfCell(cell) !== CELL_KIND.ore) return 'cut'
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  return gateVerdictOf({ state, playerId, tile, cell, ore })?.outcome ?? 'cut'
}
