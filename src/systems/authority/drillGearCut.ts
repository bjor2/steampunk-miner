/**
 * The drill's cut at its stamp, with any slice drill gear (GD lock on #205, ticket 234). The gear
 * read lists the cells past the bit and beside the bore (`drillGearCellsAt`) that pass `canMine`:
 * rig-gated and dynamite-gated cells count as solid and stay standing, and a refused one is still
 * reported in the drill's `DrillGated`. The listed cells carve in the same edit and the same ticks
 * as the disc, at their own tier hardness and drill time, and collect like any drilled cell.
 *
 * The twin bit's diagonal (GD lock on #257, ticket 279) replaces the ahead cell with the one 45
 * degrees to a side; it runs the same `canMine`, takes its own full hardness and is never listed
 * beside the bore.
 *
 * Energy: the disc charges its ticks as before. Each listed cell charges its own ticks at the
 * drill's rate, an ahead cell at `aheadEnergyShareBp` (a whole share along the facing, the side
 * floor on a diagonal) and a side cell at `sideEnergyShareBp` (never under a whole share), rounded
 * up once. The cells cut only for the ticks the tank can pay after the
 * disc's whole window, so a drill command never charges more than the tank holds.
 *
 * With no gear registered the disc carves exactly as before (`carveDisc`) and nothing more is
 * charged.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { drillGearOf } from '../registries/drillGear'
import { drillGearCellsAt } from '../vehicle/drillGearCells'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import type { VehiclePose } from '../vehicle/vehiclePose'
import {
  carveDisc,
  carveDiscWithCells,
  type Carve,
  type CarveBesideDisc,
  type CarveWindow,
} from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { materialCellAt, type WorldState } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import type { DrillGates } from './drillGates'

/** What a drill command's carve is given. */
export interface DrillCarveRequest {
  world: WorldState
  window: CarveWindow
  gates: DrillGates
  /** The tank before the command, in quanta. */
  energy: number
}

export interface DrillCarve extends Carve {
  /** The energy the drill gear's cells cost beyond the disc's ticks, in quanta. */
  gearQuanta: number
}

/** The drill gear's cells for one drill command, after `canMine`. */
export interface DrillGearRead {
  aheadCells: TilePoint[]
  aheadEnergyShareBp: number
  sideCells: TilePoint[]
  sideEnergyShareBp: number
}

/** A carve with no drill gear: nothing beyond the disc's ticks. */
export function withoutGear(carve: Carve): DrillCarve {
  return { ...carve, gearQuanta: 0 }
}

export function carveStampWithGear(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  stamp: { pose: VehiclePose; disc: DiscStamp },
  request: DrillCarveRequest,
): DrillCarve {
  const read = drillGearReadAt(state, params, playerId, stamp, request.gates)
  if (read === null) {
    return withoutGear(
      carveDisc(request.world, params, stamp.disc, request.window, request.gates.drillTicksOf),
    )
  }
  return carveDiscAndGear(params, stamp.disc, read, request)
}

/** The player's drill gear at the stamp, listing only the cells that pass `canMine`; else null. */
export function drillGearReadAt(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  stamp: { pose: VehiclePose; disc: DiscStamp },
  gates: DrillGates,
): DrillGearRead | null {
  const gear = drillGearOf(state, playerId)
  if (gear === null) return null
  const cells = drillGearCellsAt(stamp.pose, stamp.disc, gear)
  const canMine = (tile: TilePoint) => isMineableCell(state.world, params, gates, tile)
  return {
    aheadCells: cells.ahead.filter(canMine),
    aheadEnergyShareBp: gear.aheadEnergyShareBp,
    sideCells: cells.side.filter(canMine),
    sideEnergyShareBp: gear.sideEnergyShareBp,
  }
}

/** Solid ground a drill may remove that no gate holds. */
function isMineableCell(
  world: WorldState,
  params: PlanetParams,
  gates: DrillGates,
  tile: TilePoint,
): boolean {
  const cell = materialCellAt(world, params, tile)
  return isRemovableCell(cell) && gates.canMine({ tile, cell })
}

function carveDiscAndGear(
  params: PlanetParams,
  disc: DiscStamp,
  read: DrillGearRead,
  request: DrillCarveRequest,
): DrillCarve {
  const shares = cellSharesOf(read)
  const windows = { disc: request.window, cells: cellsWindowOf(request, shares) }
  const cells = [...read.aheadCells, ...read.sideCells]
  const carved = carveDiscWithCells(
    request.world,
    params,
    disc,
    cells,
    windows,
    request.gates.drillTicksOf,
  )
  return { ...carved, gearQuanta: gearQuantaOf(carved, shares) }
}

/** Each listed cell's energy share in basis points, in carve order: ahead cells, then side. */
function cellSharesOf(read: DrillGearRead): number[] {
  return [
    ...read.aheadCells.map(() => read.aheadEnergyShareBp),
    ...read.sideCells.map(() => read.sideEnergyShareBp),
  ]
}

/** The disc's window, cut short to what the tank pays for every cell after the disc's window. */
function cellsWindowOf(request: DrillCarveRequest, shares: readonly number[]): CarveWindow {
  const { window, energy } = request
  const perTick = ENERGY_QUANTA_PER_TICK.drill * shares.reduce((sum, share) => sum + share, 0)
  const left = energy - window.ticks * ENERGY_QUANTA_PER_TICK.drill
  if (perTick === 0 || left <= 0) return { firstTick: window.firstTick, ticks: 0 }
  const ticks = Math.min(window.ticks, Math.floor((left * BASIS_POINTS) / perTick))
  return { firstTick: window.firstTick, ticks }
}

/** Every cell's ticks at the drill's rate times its share, rounded up once. */
function gearQuantaOf(carved: CarveBesideDisc, shares: readonly number[]): number {
  const weighted = carved.cellTicksUsed.reduce(
    (sum, ticks, index) => sum + ticks * ENERGY_QUANTA_PER_TICK.drill * shares[index],
    0,
  )
  return Math.ceil(weighted / BASIS_POINTS)
}
