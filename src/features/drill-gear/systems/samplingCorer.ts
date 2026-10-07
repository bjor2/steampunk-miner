/**
 * The sampling corer (#162 section 1 and 4.2): a charged collar part that punches a tube ahead of
 * the bit, through rock, and draws back a plug from the first ore cell within its reach. The cell
 * stays in place and nothing reaches the hold: it gives discovery, not income.
 *
 * A gated ore cell, or a core cell, refuses the use at no cost (#162 acceptance 3): the cell is
 * unchanged and `power-up-core` logs `power_up_blocked_by_gate` and returns the charge. A gate's
 * `cut` verdict means the drill may take the cell, so the corer samples it. With no ore in reach
 * the tube comes back empty and the charge is spent.
 *
 * The codex hears no corer contact yet: `first_contact {via: corer}` needs a kernel route the codex
 * folds in (#205 Q4), so the plug is logged as the slice's own `drill-gear.ore_sampled`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged } from '../../../systems/authority/commandRule'
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { gateVerdictOf } from '../../../systems/registries/gateChecks'
import type { OreType } from '../../../systems/registries/oreTypes'
import { drillGearCellsAt } from '../../../systems/vehicle/drillGearCells'
import { drillStampOf } from '../../../systems/vehicle/drillStamp'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { gearValueOf } from './drillGearItems'
import './drillGearEvents'

export const SAMPLING_CORER_ID = 'gear.sampling_corer'

/** What a core cell in the tube's path reports as its gate. */
export const CORE_GATE_KIND = 'core'

/** The first ore or core cell in reach: its packed cell, and its ore (null for core). */
interface CoredCell {
  tile: TilePoint
  cell: number
  ore: OreType | null
}

export function sampleOreAhead(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const params = planetParamsOf(state.planet)
  const pose = vehicleOf(state, use.playerId).pose
  if (params === null || pose === null) return { kind: 'acted', effect: unchanged(state) }
  const cored = firstCoredCellOf(state, params, pose)
  return cored === null
    ? { kind: 'acted', effect: unchanged(state) }
    : outcomeOfCoring(state, params, use.playerId, cored)
}

/** The tube's cells past the bit, nearest first, up to the corer's reach. */
function tubeCellsOf(pose: VehiclePose): TilePoint[] {
  const aheadCells = gearValueOf(SAMPLING_CORER_ID, 'reachTiles')
  return drillGearCellsAt(pose, drillStampOf(pose, false), { aheadCells, sideCells: 0 }).ahead
}

function firstCoredCellOf(
  state: AuthorityState,
  params: PlanetParams,
  pose: VehiclePose,
): CoredCell | null {
  for (const tile of tubeCellsOf(pose)) {
    const cell = cellAt(state.world, params, tile)
    if (isCoredKind(cell)) return { tile, cell, ore: oreTypeAtTile(state, tile) }
  }
  return null
}

function isCoredKind(cell: number): boolean {
  const kind = kindOfCell(cell)
  return kind === CELL_KIND.ore || kind === CELL_KIND.core
}

/** Core always refuses the tube; an ore cell refuses it while a gate holds it from the drill. */
function outcomeOfCoring(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  { tile, cell, ore }: CoredCell,
): PowerUpOutcome {
  const cellTier = resourceTierOf(params, cell)
  if (ore === null)
    return { kind: 'blocked', block: { cellTier, gateKind: CORE_GATE_KIND, ...tile } }
  const verdict = gateVerdictOf({ state, playerId, tile, cell, ore, blast: null })
  if (verdict === null || verdict.outcome === 'cut') return sampled(state, playerId, tile, ore)
  return { kind: 'blocked', block: { cellTier, gateKind: verdict.gateKind, ...tile } }
}

function sampled(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
  ore: OreType,
): PowerUpOutcome {
  return {
    kind: 'acted',
    effect: {
      state,
      events: [{ type: 'drill-gear.OreSampled', playerId, ...tile, oreId: ore.id }],
    },
  }
}
