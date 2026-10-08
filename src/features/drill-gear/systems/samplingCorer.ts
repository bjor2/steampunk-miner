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
 * The plug is the kernel's `OreSampled {via: corer}` (#243, from the #205 lock Q2), which the codex
 * hears as `first_contact {via: corer}`.
 *
 * Aim (GD lock on #206, ticket 327): the corer consults the kernel's `aim` item hooks on which cell
 * to plug. The candidates are the ore cells the tube reaches before any cell that refuses it, so a
 * hook only reorders cells the corer could already sample, nearest first by default, and never a
 * gated or core cell. The world is never changed, so no hook alters what a dig cuts. With no hook
 * answering the nearest cell is plugged, as before.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged } from '../../../systems/authority/commandRule'
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { gateVerdictOf } from '../../../systems/registries/gateChecks'
import { rankedCandidatesOf, type SelectionHookAsk } from '../../../systems/registries/itemHooks'
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

export const SAMPLING_CORER_ID = 'gear.sampling_corer'

/** What a core cell in the tube's path reports as its gate. */
export const CORE_GATE_KIND = 'core'

/** An ore or core cell in reach: its packed cell, and its ore (null for core). */
interface CoredCell {
  tile: TilePoint
  cell: number
  ore: OreType | null
}

type OreCell = CoredCell & { ore: OreType }

export function sampleOreAhead(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const params = planetParamsOf(state.planet)
  const pose = vehicleOf(state, use.playerId).pose
  if (params === null || pose === null) return { kind: 'acted', effect: unchanged(state) }
  const cored = aimedCoredCellOf(state, use, coredCellsOf(state, params, pose))
  return cored === null
    ? { kind: 'acted', effect: unchanged(state) }
    : outcomeOfCoring(state, params, use.playerId, cored)
}

/** The tube's cells past the bit, nearest first, up to the corer's reach. */
function tubeCellsOf(pose: VehiclePose): TilePoint[] {
  return drillGearCellsAt(pose, drillStampOf(pose, false), { aheadCells: reachOf(), sideCells: 0 })
    .ahead
}

function reachOf(): number {
  return gearValueOf(SAMPLING_CORER_ID, 'reachTiles')
}

/** Every ore or core cell in the tube, nearest first. */
function coredCellsOf(state: AuthorityState, params: PlanetParams, pose: VehiclePose): CoredCell[] {
  return tubeCellsOf(pose)
    .map((tile) => ({ tile, cell: cellAt(state.world, params, tile) }))
    .filter(({ cell }) => isCoredKind(cell))
    .map(({ tile, cell }) => ({ tile, cell, ore: oreTypeAtTile(state, tile) }))
}

function isCoredKind(cell: number): boolean {
  const kind = kindOfCell(cell)
  return kind === CELL_KIND.ore || kind === CELL_KIND.core
}

/**
 * The cell the tube plugs: the aim hooks' pick among the sampleable cells before the first that
 * refuses the tube; that refusing cell when it is the nearest; null with no ore in reach.
 */
function aimedCoredCellOf(
  state: AuthorityState,
  use: PowerUpUse,
  cored: readonly CoredCell[],
): CoredCell | null {
  const sampleable = leadingSampleableOf(state, use.playerId, cored)
  if (sampleable.length === 0) return cored[0] ?? null
  const [aimed] = rankedCandidatesOf(state, use.playerId, aimAskOf(use, sampleable))
  return sampleable.find(({ tile }) => tile === aimed) ?? sampleable[0]
}

/** The cored cells before the first one that refuses the tube. */
function leadingSampleableOf(
  state: AuthorityState,
  playerId: string,
  cored: readonly CoredCell[],
): CoredCell[] {
  const refusing = cored.findIndex((cell) => !isSampleable(state, playerId, cell))
  return refusing === -1 ? [...cored] : cored.slice(0, refusing)
}

function isSampleable(state: AuthorityState, playerId: string, cored: CoredCell): boolean {
  return isOreCell(cored) && refusedGateKindOf(state, playerId, cored) === null
}

function isOreCell(cored: CoredCell): cored is OreCell {
  return cored.ore !== null
}

function aimAskOf(use: PowerUpUse, sampleable: readonly CoredCell[]): SelectionHookAsk {
  return {
    point: 'aim',
    parentItemId: SAMPLING_CORER_ID,
    ctx: {
      tick: use.tick,
      mark: use.mark,
      magnitude: use.magnitude ?? reachOf(),
      origin: use.origin,
      candidates: sampleable.map(({ tile }) => tile),
    },
  }
}

/** Core always refuses the tube; an ore cell refuses it while a gate holds it from the drill. */
function outcomeOfCoring(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  cored: CoredCell,
): PowerUpOutcome {
  if (!isOreCell(cored)) return blockedAt(params, cored, CORE_GATE_KIND)
  const gateKind = refusedGateKindOf(state, playerId, cored)
  return gateKind === null ? sampled(state, playerId, cored) : blockedAt(params, cored, gateKind)
}

/** The gate kind holding this ore cell from the drill; null when the corer may sample it. */
function refusedGateKindOf(
  state: AuthorityState,
  playerId: string,
  { tile, cell, ore }: OreCell,
): string | null {
  const verdict = gateVerdictOf({ state, playerId, tile, cell, ore, blast: null })
  return verdict === null || verdict.outcome === 'cut' ? null : verdict.gateKind
}

function blockedAt(
  params: PlanetParams,
  { tile, cell }: CoredCell,
  gateKind: string,
): PowerUpOutcome {
  return { kind: 'blocked', block: { cellTier: resourceTierOf(params, cell), gateKind, ...tile } }
}

function sampled(state: AuthorityState, playerId: string, { tile, ore }: OreCell): PowerUpOutcome {
  return {
    kind: 'acted',
    effect: {
      state,
      events: [{ type: 'OreSampled', playerId, ...tile, oreId: ore.id, via: 'corer' }],
    },
  }
}
