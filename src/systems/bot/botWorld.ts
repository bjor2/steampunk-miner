/**
 * What the bot reads of the world and how long things take it (#29 Systems & Economy note 3, the
 * movement-time model of the #6 simulation, not physics): driving and falling along a bored tunnel
 * at the travel speed for `drive` energy, climbing at the same speed for `thrust` energy, and
 * boring a tile in exactly the ticks the #7 drill rule gives. Tiles are 1 m. The travel speed is
 * the rig's effective one (travel parity, ticket 333): the engine's top speed until k times the
 * drill's cut speed passes it.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { planetParamsOf } from '../authority/planetOfState'
import { scriptedGearCellsOf } from '../authority/scriptedGearCells'
import { effectiveTravelSpeedOf } from '../authority/travelSpeed'
import type { AuthorityState } from '../authority/authorityState'
import { hardnessOfTile, ticksPerCell } from '../authority/groundDrill'
import { scratchFloorOfCell } from '../authority/signatureCells'
import type { BigStat } from '../money'
import { canScratch, type DrillStats } from '../vehicle/drillRule'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { isInsidePlanet } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, GROUND_CELL, isAirCell, isRemovableCell, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import { botPoseAt, facingTowards } from './botPose'

export type BotTileKind = 'open' | 'ground' | 'ore' | 'core' | 'pad' | 'lava'

const LAVA_NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
]

export function paramsOfSession(state: AuthorityState): PlanetParams {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the bot plays only on a generated planet')
  return params
}

export function tileKindAt(state: AuthorityState, tile: TilePoint): BotTileKind {
  const kind = kindOfCell(cellAt(state.world, paramsOfSession(state), tile))
  if (kind === CELL_KIND.ore) return 'ore'
  if (kind === CELL_KIND.core) return 'core'
  // The cache drills like rock and yields nothing (#46); the bot never opens it.
  if (kind === CELL_KIND.ground || kind === CELL_KIND.artefactCache) return 'ground'
  if (kind === CELL_KIND.indestructible) return 'pad'
  if (kind === CELL_KIND.lava) return 'lava'
  return 'open'
}

/**
 * #113: opening this tile would free a lava pocket (it is lava, or lava is a 4-neighbour), and a
 * vehicle standing in it would touch the lava. The bot never bores or enters such a tile.
 */
export function isLavaRisk(state: AuthorityState, tile: TilePoint): boolean {
  return LAVA_NEIGHBOURS.some(
    ([dx, dy]) => tileKindAt(state, { tx: tile.tx + dx, ty: tile.ty + dy }) === 'lava',
  )
}

/**
 * #113 for a bore with drill gear (ticket 392): the bored tile, or a cell the gear cuts with it
 * from `from`, would free lava. A side cutter's cell beside a pocket frees it as surely as the bit.
 */
export function isBoreLavaRisk(
  state: AuthorityState,
  playerId: string,
  from: TilePoint,
  tile: TilePoint,
): boolean {
  const cut = [tile, ...gearCellsOfBore(state, playerId, from, tile)]
  return cut.some((cell) => isLavaRisk(state, cell))
}

/** The gear's cells of a bore of `tile` from `from`, as the authority will cut them. */
function gearCellsOfBore(
  state: AuthorityState,
  playerId: string,
  from: TilePoint,
  tile: TilePoint,
): TilePoint[] {
  const pose = botPoseAt(from, facingTowards(from, tile))
  return scriptedGearCellsOf(state, playerId, { tile, pose })
}

export function isInsideWorld(state: AuthorityState, tile: TilePoint): boolean {
  return isInsidePlanet(paramsOfSession(state), tile.tx, tile.ty)
}

export function cellOfTile(state: AuthorityState, tile: TilePoint): number {
  return cellAt(state.world, paramsOfSession(state), tile)
}

/** The planner prices a shaft row as plain ground of its band, before it knows what lies there. */
export function groundHardnessAt(params: PlanetParams, tile: TilePoint): BigStat {
  return hardnessOfTile(params, tile, GROUND_CELL)
}

/**
 * #29 Gameplay note 3: the bot never bores a tile its tip only skids on (`P < H/4`). It reads the
 * drill's own hardness and floor, so a lead ore cell (#140) costs it what it costs the drill (#223)
 * and a signature it cannot cut (#232) is a wall to route around.
 */
export function canBore(drill: DrillStats, params: PlanetParams, tile: TilePoint, cell: number) {
  return isRemovableCell(cell) && isScratchableCell(drill, params, tile, cell)
}

/** Ticks to break an intact tile, or null when the tip cannot scratch it. */
export function boreTicks(
  drill: DrillStats,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): number | null {
  if (isAirCell(cell)) return 0
  if (!canBore(drill, params, tile, cell)) return null
  return ticksPerCell(drill, params, tile, cell)
}

function isScratchableCell(
  drill: DrillStats,
  params: PlanetParams,
  tile: TilePoint,
  cell: number,
): boolean {
  const floor = scratchFloorOfCell(params, tile, cell)
  return canScratch(drill.gateTip, hardnessOfTile(params, tile, cell), floor)
}

/** Ticks to cover `tiles` metres at `speedMax` m/s, whole steps rounded up. */
export function moveTicks(tiles: number, speedMax: number): number {
  return Math.ceil((tiles * TICKS_PER_SECOND) / speedMax)
}

/**
 * m/s the bot moves at where its rig stands: the effective travel speed. No longer held to the
 * fixed 18 m/s pose bound: #334 derives the bound from the rig's stats, and with no tile floor
 * (ticket 397) the drill's cut, and so travel, has no cap (HS on #397: rows read effective travel
 * speed, never speedMax or the floor).
 */
export function botTravelSpeedOf(state: AuthorityState, playerId: string): number {
  return effectiveTravelSpeedOf(state, playerId)
}

/** The quanta a move costs: driving and falling at the drive rate, climbing at the thrust rate. */
export function moveQuanta(driveTicks: number, climbTicks: number): number {
  return driveTicks * ENERGY_QUANTA_PER_TICK.drive + climbTicks * ENERGY_QUANTA_PER_TICK.thrust
}

export function boreQuanta(ticks: number): number {
  return ticks * ENERGY_QUANTA_PER_TICK.drill
}
