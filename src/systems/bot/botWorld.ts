/**
 * What the bot reads of the world and how long things take it (#29 Systems & Economy note 3, the
 * movement-time model of the #6 simulation, not physics): driving and falling along a bored tunnel
 * at the engine's top speed for `drive` energy, climbing at the same speed for `thrust` energy,
 * and boring a tile in exactly the ticks the #7 drill rule gives. Tiles are 1 m.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { planetParamsOf } from '../authority/planetOfState'
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
  const floor = scratchFloorOfCell(params, cell)
  return canScratch(drill.gateTip, hardnessOfTile(params, tile, cell), floor)
}

/** Ticks to cover `tiles` metres at `speedMax` m/s, whole steps rounded up. */
export function moveTicks(tiles: number, speedMax: number): number {
  return Math.ceil((tiles * TICKS_PER_SECOND) / speedMax)
}

/** The quanta a move costs: driving and falling at the drive rate, climbing at the thrust rate. */
export function moveQuanta(driveTicks: number, climbTicks: number): number {
  return driveTicks * ENERGY_QUANTA_PER_TICK.drive + climbTicks * ENERGY_QUANTA_PER_TICK.thrust
}

export function boreQuanta(ticks: number): number {
  return ticks * ENERGY_QUANTA_PER_TICK.drill
}
