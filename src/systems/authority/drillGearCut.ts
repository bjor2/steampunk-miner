/**
 * The drill's cut at its stamp, with any slice drill gear (GD lock on #205, ticket 234). The gear
 * read lists the cells past the bit and beside the bore (`drillGearCellsAt`) that pass `canMine`:
 * rig-gated and dynamite-gated cells count as solid and stay standing, and a refused one is still
 * reported in the drill's `DrillGated`. The listed cells carve in the same edit and the same ticks
 * as the disc, at their own tier hardness and drill time, and collect like any drilled cell, but
 * a side cell's ore pays the kernel's side share (`sideOreCredit.ts`, ticket 620).
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
 * disc's whole window, so a drill command never charges more than the tank holds. A carve that
 * tallies law work (ticket 535) also answers it share-weighted, each listed cell at its share, for
 * the report cut's charge on density removed.
 *
 * The scripted `drillTile` reads the same gear (GD ruling on #392), so the pacing bot and the player
 * share one cut: the bit is the bored cell (`cellStampOf`), aimed by the last reported pose's facing
 * and the push that facing stands for (`driveOfFacing`). The gear cells are the next tiles along the
 * facing and the tiles beside the bored one, each carved whole at its own drill time and charged as
 * the stamp's are. Ahead cells are read nearest first and stop at the first one `canMine` refuses,
 * so a gated cell is never reached past.
 *
 * With no gear registered the disc carves exactly as before (`carveDisc`), the scripted cell too
 * (`carveCell`), and nothing more is charged.
 */
import { BASIS_POINTS } from '../../constants/balance'
import {
  aheadEnergyShareOf,
  isAheadBearingAllowed,
  type AheadBearing,
  type CutCellKind,
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
import { cellStampOf, drillGearCellsAt } from '../vehicle/drillGearCells'
import { driveOfFacing } from '../vehicle/driveSigns'
import { latchFacedSide, type SideLatch } from '../vehicle/facedSide'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  carveCell,
  carveCellWithCells,
  carveDisc,
  carveDiscWithCells,
  type Carve,
  type CarveBesideDisc,
  type CarveWindow,
  type CarveWindows,
  type CellsBesideCut,
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
  /** The most ticks any of the drill gear's cells still removed something in; 0 with none cut. */
  gearTicksUsed: number
  /** `lawWork` with each gear cell at its energy share, in basis points (ticket 535). */
  lawWorkBp: number
  /** The drill gear's cells this cut reached, each with its energy share (ticket 335). */
  gearCells: readonly GearCellShare[]
  /** The ahead bearing this cut latched, or null when no gear is aimed by the drive. */
  aheadLatch: AheadLatch | null
  /** The faced side this cut latched, or null when no side ask is aimed by the drive. */
  sideLatch: SideLatch | null
}

/** A drill-gear cell, its energy share in basis points of the drill's, and which gear cell it is. */
export interface GearCellShare extends TilePoint {
  shareBp: number
  kind: Exclude<CutCellKind, 'bit'>
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
  return {
    ...carve,
    gearQuanta: 0,
    gearTicksUsed: 0,
    lawWorkBp: carve.lawWork * BASIS_POINTS,
    gearCells: [],
    aheadLatch: null,
    sideLatch: null,
  }
}

/** Whether the bit or any of its gear's cells removed something: a carve to charge and collect. */
export function hasCarveRemoved(carved: DrillCarve): boolean {
  return carved.ticksUsed > 0 || carved.gearTicksUsed > 0
}

/**
 * The cut at the bit with its gear, the gear's cells cut with the bit, or on every tick of the
 * window (the report capsule's running bite, ticket 537).
 */
export function carveStampWithGear(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  bit: DrillBit,
  request: DrillCarveRequest,
  cellsCut: CellsBesideCut = 'withBit',
): DrillCarve {
  const read = drillGearReadAt(state, params, playerId, bit, request.gates)
  return carveStampWithRead(params, bit, read, request, { walk: walkStampInRows, cellsCut })
}

/**
 * Scripted mining of one cell with the player's drill gear (ticket 392): the bit is the cell, aimed
 * by the last reported pose; with no gear, or no pose yet, the cell alone.
 */
export function carveCellWithGear(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  tile: TilePoint,
  request: DrillCarveRequest,
): DrillCarve {
  const bit = cellBitOf(state, playerId, tile)
  const read = bit === null ? null : drillGearReadAt(state, params, playerId, bit, request.gates)
  if (read === null) return withoutGear(carveBareCell(params, tile, request))
  return carveBitAndGear(read, request, cellWithCellsOf(params, tile, request))
}

/** The bored cell as the gear reads it, from the last reported pose; null before any report. */
function cellBitOf(state: AuthorityState, playerId: string, tile: TilePoint): DrillBit | null {
  const { pose } = vehicleOf(state, playerId)
  return pose === null ? null : cellBitAt(pose, tile)
}

/** The bored cell as the gear reads it from `pose`: its facing aims it, with the push it stands for. */
export function cellBitAt(pose: VehiclePose, tile: TilePoint): DrillBit {
  return { pose, disc: cellStampOf(tile), drive: driveOfFacing(pose.facing) }
}

function carveBareCell(params: PlanetParams, tile: TilePoint, request: DrillCarveRequest): Carve {
  return carveCell(request.world, params, tile, request.window, request.gates.drillTicksOf)
}

function cellWithCellsOf(
  params: PlanetParams,
  tile: TilePoint,
  { world, gates }: DrillCarveRequest,
): CarveWithCells {
  return (cells, windows) =>
    carveCellWithCells(world, params, tile, cells, windows, gates.drillTicksOf)
}

/** How a carve walks the bit's stamp, and when the cells beside it are cut. */
export interface StampCut {
  walk: StampWalk
  cellsCut: CellsBesideCut
}

/** The stamp walked by `walk`, its cells beside cut with the bit. */
export function walkedWithBit(walk: StampWalk): StampCut {
  return { walk, cellsCut: 'withBit' }
}

/**
 * The cut at the bit with its gear read already taken, walking the stamp by `cut.walk`: the swept
 * cut counts its cells first, and the swept span walks it per chunk (ticket 374).
 */
export function carveStampWithRead(
  params: PlanetParams,
  bit: DrillBit,
  read: DrillGearRead | null,
  request: DrillCarveRequest,
  cut: StampCut,
): DrillCarve {
  const stamp = { disc: bit.disc, ...cut }
  if (read === null) return withoutGear(carveBareDisc(params, stamp, request))
  return carveBitAndGear(read, request, discWithCellsOf(params, stamp, request))
}

/** The bit's stamp, how the carve walks it, and when the cells beside it are cut. */
interface WalkedDisc extends StampCut {
  disc: DiscStamp
}

function carveBareDisc(
  params: PlanetParams,
  { disc, walk }: WalkedDisc,
  request: DrillCarveRequest,
) {
  const { world, window, gates } = request
  return carveDisc(world, params, disc, window, gates.drillTicksOf, walk)
}

function discWithCellsOf(
  params: PlanetParams,
  { disc, walk, cellsCut }: WalkedDisc,
  { world, gates }: DrillCarveRequest,
): CarveWithCells {
  return (cells, windows) =>
    carveDiscWithCells(world, params, disc, cells, windows, gates.drillTicksOf, walk, cellsCut)
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
  const canCut = (tile: TilePoint) => isCuttableCell(state.world, params, gates, tile)
  const isUncut = (tile: TilePoint) => canMine(tile) && !isTileYielded(state.world, tile)
  const isStanding = (tile: TilePoint) => isStandingCell(state.world, params, tile)
  const crossing = { isMineable: canMine, isStanding }
  const isLatchUncut = (tile: TilePoint) => isUncutUnreported(state.world, params, gates, tile)
  const aheadLatch = aheadLatchOf(state, playerId, gear, bit, { isUncut: isLatchUncut, crossing })
  const aheadBearing = aheadLatch?.bearing ?? 'facing'
  const aheadCells = aheadCellsOn(gear, aheadBearing)
  const sideLatch = sideLatchOf(state, playerId, gear, bit, isUncut)
  const facedSide = sideLatch?.side
  const reach = { ...gear, aheadCells, aheadBearing, facedSide }
  const cells = drillGearCellsAt(bit.pose, bit.disc, reach)
  return {
    aheadCells: cellsUpToFirstRefused(cells.ahead, (tile) => canMine(tile) && canCut(tile)),
    aheadEnergyShareBp: aheadEnergyShareOf(gear, aheadBearing),
    sideCells: cells.side.filter(canMine),
    sideEnergyShareBp: gear.sideEnergyShareBp,
    aheadLatch,
    sideLatch,
  }
}

/**
 * The cells in order until the first one the drill may not cut: an ahead cut never reaches past a
 * gated or tip-locked cell (GD ruling on #392).
 */
function cellsUpToFirstRefused(
  cells: readonly TilePoint[],
  canCut: (tile: TilePoint) => boolean,
): TilePoint[] {
  const refused = cells.findIndex((tile) => !canCut(tile))
  return refused === -1 ? [...cells] : cells.slice(0, refused)
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

/** A cell the drill's tip scratches: it has a drill time (#29's `P < H/4` skid has none). */
function isCuttableCell(
  world: WorldState,
  params: PlanetParams,
  gates: DrillGates,
  tile: TilePoint,
): boolean {
  return gates.drillTicksOf(tile, materialCellAt(world, params, tile), 0) !== null
}

/**
 * A latched cell still standing uncut, its gates asked without reporting them: the latch's check
 * is not the drill meeting the cell, so a drive-aimed head cutting along the facing as the bare
 * drill reports what the bare drill does (TD lock on #280). A cell it then cuts is reported there.
 */
function isUncutUnreported(
  world: WorldState,
  params: PlanetParams,
  gates: DrillGates,
  tile: TilePoint,
): boolean {
  const cell = materialCellAt(world, params, tile)
  return isRemovableCell(cell) && gates.canMineUnreported(tile) && !isTileYielded(world, tile)
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

/** The bit's carve with the gear's cells beside it, in the same edit. */
type CarveWithCells = (cells: readonly TilePoint[], windows: CarveWindows) => CarveBesideDisc

function carveBitAndGear(
  read: DrillGearRead,
  request: DrillCarveRequest,
  carveWithCells: CarveWithCells,
): DrillCarve {
  const shares = cellSharesOf(read)
  const windows = { disc: request.window, cells: cellsWindowOf(request, shares) }
  const cells = [...read.aheadCells, ...read.sideCells]
  const carved = carveWithCells(cells, windows)
  const latches = { aheadLatch: read.aheadLatch, sideLatch: read.sideLatch }
  const gearCells = gearCellSharesOf(read, cells, shares)
  return {
    ...carved,
    gearQuanta: gearQuantaOf(carved, shares),
    gearTicksUsed: Math.max(0, ...carved.cellTicksUsed),
    lawWorkBp: lawWorkBpOf(carved, shares),
    gearCells,
    ...latches,
  }
}

/** The disc's law work at the drill's whole share, and each listed cell's at its own (ticket 535). */
function lawWorkBpOf(carved: CarveBesideDisc, shares: readonly number[]): number {
  const cellsLaw = carved.cellLawWork.reduce((sum, law) => sum + law, 0)
  const cellsLawBp = carved.cellLawWork.reduce((sum, law, index) => sum + law * shares[index], 0)
  return (carved.lawWork - cellsLaw) * BASIS_POINTS + cellsLawBp
}

/** Each listed cell's energy share in basis points, in carve order: ahead cells, then side. */
function cellSharesOf(read: DrillGearRead): number[] {
  return [
    ...read.aheadCells.map(() => read.aheadEnergyShareBp),
    ...read.sideCells.map(() => read.sideEnergyShareBp),
  ]
}

/** Each listed cell with its energy share and its kind, in carve order. */
function gearCellSharesOf(
  read: DrillGearRead,
  cells: readonly TilePoint[],
  shares: readonly number[],
): GearCellShare[] {
  const kinds = cellKindsOf(read)
  return cells.map((tile, index) => ({ ...tile, shareBp: shares[index], kind: kinds[index] }))
}

/** Each listed cell's kind, in carve order: ahead cells, then side. */
function cellKindsOf(read: DrillGearRead): GearCellShare['kind'][] {
  return [
    ...read.aheadCells.map(() => 'ahead' as const),
    ...read.sideCells.map(() => 'side' as const),
  ]
}

/** The disc's window, cut short to what the tank pays for every cell after the disc's window. */
function cellsWindowOf(request: DrillCarveRequest, shares: readonly number[]): CarveWindow {
  const { energy } = request
  const window = withoutFront(request.window)
  const perTick = ENERGY_QUANTA_PER_TICK.drill * shares.reduce((sum, share) => sum + share, 0)
  const left = energy - window.ticks * ENERGY_QUANTA_PER_TICK.drill
  if (perTick === 0 || left <= 0) return { ...window, ticks: 0 }
  const ticks = Math.min(window.ticks, Math.floor((left * BASIS_POINTS) / perTick))
  return { ...window, ticks }
}

/**
 * The window without the swept cut's front (ticket 570): the gear's cells keep carving at their
 * own drill time, as the gear's own reach, not the bit's front, says where they cut.
 */
function withoutFront(window: CarveWindow): CarveWindow {
  if (window.front === undefined) return window
  const { front: _front, ...plain } = window
  return plain
}

/** Every cell's ticks at the drill's rate times its share, rounded up once. */
function gearQuantaOf(carved: CarveBesideDisc, shares: readonly number[]): number {
  const weighted = carved.cellTicksUsed.reduce(
    (sum, ticks, index) => sum + ticks * ENERGY_QUANTA_PER_TICK.drill * shares[index],
    0,
  )
  return Math.ceil(weighted / BASIS_POINTS)
}
