/**
 * The drill's cut at its stamp, with any slice drill gear (GD lock on #205, ticket 234). The gear
 * read lists the cells past the bit and beside the bore (`drillGearCellsAt`) that pass `canMine`:
 * rig-gated and dynamite-gated cells count as solid and stay standing, and a refused one is still
 * reported in the drill's `DrillGated`. The listed cells carve in the same edit and the same ticks
 * as the disc, at their own tier hardness and drill time, and collect like any drilled cell.
 *
 * The twin bit's diagonal (GD lock on #257, ticket 279) replaces the ahead cell with the one 45
 * degrees to a side; it runs the same `canMine`, takes its own full hardness and is never listed
 * beside the bore. Gear aimed by the drive takes its bearing from the reported drive side, latched
 * per cell (`aheadBearingLatch.ts`); the read hands the latch back for the vehicle to keep. Such
 * gear cuts ahead only on a diagonal: with no side pushed the twin bit cuts as the bare drill (TD
 * lock on #280), and only facing-aimed gear (the reach boom) cuts past the bit along the facing.
 *
 * Gear may allow the up-diagonal (TD lock on #288, ticket 372): facing up, lifting with a side
 * pushed, the latch turns the ahead cell 45 degrees up toward that side. The diagonal crosses the
 * ceiling cell along the facing on its way to the cell it cuts, so both must pass: a standing
 * cell on either that the drill may not remove refuses the turn, and the cut stays along the
 * facing. A gated ceiling is never opened sideways. One latch per cut, no new per-tick loop.
 *
 * The side cutters' Mark 3 hold (TD lock on #276) aims the side cells by the drive: the read
 * latches the faced side per cell (`facedSide.ts`), cuts that side's cells and only the both-sided
 * asks' on the other, and hands the latch back for the vehicle to keep. Each side cell still runs
 * `canMine` and pays its own share, so one flank costs half the cells.
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
import {
  aheadEnergyShareOf,
  isAheadBearingAllowed,
  type AheadBearing,
  type DrillGear,
} from '../economy/drillGearCaps'
import { drillGearOf } from '../registries/drillGear'
import {
  extraBearingOf,
  latchAheadBearing,
  type AheadLatch,
  type AheadLatchRules,
  type DrillBit,
} from '../vehicle/aheadBearingLatch'
import { drillGearCellsAt } from '../vehicle/drillGearCells'
import { latchFacedSide, type SideLatch } from '../vehicle/facedSide'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  carveDisc,
  carveDiscWithCells,
  type Carve,
  type CarveBesideDisc,
  type CarveWindow,
  type StampWalk,
  walkStampInRows,
} from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell, isSolidCell } from '../world/worldCell'
import { isTileYielded, materialCellAt, type WorldState } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
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
  /** The ahead bearing this cut latched, or null when no gear is aimed by the drive. */
  aheadLatch: AheadLatch | null
  /** The faced side this cut latched, or null when no side ask is aimed by the drive. */
  sideLatch: SideLatch | null
}

/** The drill gear's cells for one drill command, after `canMine`. */
export interface DrillGearRead {
  aheadCells: TilePoint[]
  aheadEnergyShareBp: number
  sideCells: TilePoint[]
  sideEnergyShareBp: number
  aheadLatch: AheadLatch | null
  sideLatch: SideLatch | null
}

/** A carve with no drill gear: nothing beyond the disc's ticks. */
export function withoutGear(carve: Carve): DrillCarve {
  return { ...carve, gearQuanta: 0, aheadLatch: null, sideLatch: null }
}

export function carveStampWithGear(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  bit: DrillBit,
  request: DrillCarveRequest,
): DrillCarve {
  const read = drillGearReadAt(state, params, playerId, bit, request.gates)
  return carveStampWithRead(params, bit, read, request, walkStampInRows)
}

/**
 * The cut at the bit with its gear read already taken, walking the stamp by `walk`: the swept cut
 * counts its cells first, and the swept span walks it per chunk (ticket 374).
 */
export function carveStampWithRead(
  params: PlanetParams,
  bit: DrillBit,
  read: DrillGearRead | null,
  request: DrillCarveRequest,
  walk: StampWalk,
): DrillCarve {
  if (read === null) {
    const { world, window, gates } = request
    return withoutGear(carveDisc(world, params, bit.disc, window, gates.drillTicksOf, walk))
  }
  return carveDiscAndGear(params, { disc: bit.disc, walk }, read, request)
}

/** The player's drill gear at the bit, listing only the cells that pass `canMine`; else null. */
export function drillGearReadAt(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  bit: DrillBit,
  gates: DrillGates,
): DrillGearRead | null {
  const gear = drillGearOf(state, playerId)
  if (gear === null) return null
  const canMine = (tile: TilePoint) => isMineableCell(state.world, params, gates, tile)
  const isUncut = (tile: TilePoint) => canMine(tile) && !isTileYielded(state.world, tile)
  const isStanding = (tile: TilePoint) => isStandingCell(state.world, params, tile)
  const crossing = { isMineable: canMine, isStanding }
  const aheadLatch = aheadLatchOf(state, playerId, gear, bit, { isUncut, crossing })
  const aheadBearing = aheadLatch?.bearing ?? 'facing'
  const aheadCells = aheadCellsOn(gear, aheadBearing)
  const sideLatch = sideLatchOf(state, playerId, gear, bit, isUncut)
  const facedSide = sideLatch?.side
  const reach = { ...gear, aheadCells, aheadBearing, facedSide }
  const cells = drillGearCellsAt(bit.pose, bit.disc, reach)
  return {
    aheadCells: cells.ahead.filter(canMine),
    aheadEnergyShareBp: aheadEnergyShareOf(gear, aheadBearing),
    sideCells: cells.side.filter(canMine),
    sideEnergyShareBp: gear.sideEnergyShareBp,
    aheadLatch,
    sideLatch,
  }
}

/** A drive-aimed ask cuts ahead only on a diagonal; along the facing only the others do (#280). */
function aheadCellsOn(gear: DrillGear, bearing: AheadBearing): number {
  return bearing === 'facing' ? gear.facingAheadCells : gear.aheadCells
}

/** How the cells an extra bearing crosses are judged: open ground, or ground the drill may cut. */
interface CrossingRules {
  isMineable: (tile: TilePoint) => boolean
  isStanding: (tile: TilePoint) => boolean
}

interface AheadLatchReads {
  isUncut: (tile: TilePoint) => boolean
  crossing: CrossingRules
}

/**
 * The bearing latched for this cut when the drive aims the ahead cells; else none. An extra
 * bearing whose crossed cells refuse it gives way to the facing's latch.
 */
function aheadLatchOf(
  state: AuthorityState,
  playerId: string,
  gear: DrillGear,
  bit: DrillBit,
  reads: AheadLatchReads,
): AheadLatch | null {
  if (gear.aheadAim !== 'drive' || gear.aheadCells === 0) return null
  const rules: AheadLatchRules = {
    isUncut: reads.isUncut,
    allows: (bearing) => isAheadBearingAllowed(gear, bearing),
  }
  const latch = latchAheadBearing(vehicleOf(state, playerId).aheadLatch ?? null, bit, rules)
  if (isCrossingClear(bit, latch, reads.crossing)) return latch
  return latchAheadBearing(null, bit, { ...rules, allows: () => false })
}

/** Every cell an extra bearing's diagonal crosses is open or one the drill may cut; else refused. */
function isCrossingClear(bit: DrillBit, latch: AheadLatch, crossing: CrossingRules): boolean {
  if (extraBearingOf(bit.pose.facing, latch.bearing) === null) return true
  const isPassable = (tile: TilePoint) => !crossing.isStanding(tile) || crossing.isMineable(tile)
  return crossedCellsOf(bit, latch).every(isPassable)
}

/** The ceiling cell along the facing the diagonal turns from, then the cell it cuts. */
function crossedCellsOf(bit: DrillBit, latch: AheadLatch): TilePoint[] {
  const alongFacing = { aheadCells: 1, sideCells: 0, aheadBearing: 'facing' as const }
  return [drillGearCellsAt(bit.pose, bit.disc, alongFacing).ahead[0], latch.tile]
}

/** The faced side latched for this cut when the drive aims the side cells; else none. */
function sideLatchOf(
  state: AuthorityState,
  playerId: string,
  gear: DrillGear,
  bit: DrillBit,
  isUncut: (tile: TilePoint) => boolean,
): SideLatch | null {
  if (gear.sideAim !== 'drive' || gear.sideCells === 0) return null
  return latchFacedSide(vehicleOf(state, playerId), bit, gear.sideSeed, isUncut)
}

/** Ground still in the way: solid and not yet opened. */
function isStandingCell(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  return isSolidCell(materialCellAt(world, params, tile)) && !isTileYielded(world, tile)
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

/** The bit's stamp and how the carve walks it. */
interface WalkedDisc {
  disc: DiscStamp
  walk: StampWalk
}

function carveDiscAndGear(
  params: PlanetParams,
  { disc, walk }: WalkedDisc,
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
    walk,
  )
  const latches = { aheadLatch: read.aheadLatch, sideLatch: read.sideLatch }
  return { ...carved, gearQuanta: gearQuantaOf(carved, shares), ...latches }
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
  if (perTick === 0 || left <= 0) return { ...window, ticks: 0 }
  const ticks = Math.min(window.ticks, Math.floor((left * BASIS_POINTS) / perTick))
  return { ...window, ticks }
}

/** Every cell's ticks at the drill's rate times its share, rounded up once. */
function gearQuantaOf(carved: CarveBesideDisc, shares: readonly number[]): number {
  const weighted = carved.cellTicksUsed.reduce(
    (sum, ticks, index) => sum + ticks * ENERGY_QUANTA_PER_TICK.drill * shares[index],
    0,
  )
  return Math.ceil(weighted / BASIS_POINTS)
}
