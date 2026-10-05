/**
 * What the bot reads of the world and how long things take it (#29 Systems & Economy note 3, the
 * movement-time model of the #6 simulation, not physics): driving and falling along a bored tunnel
 * at the engine's top speed for `drive` energy, climbing at the same speed for `thrust` energy,
 * and boring a tile in exactly the ticks the #7 drill rule gives. Tiles are 1 m.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { planetParamsOf } from '../authority/planetOfState'
import type { AuthorityState } from '../authority/authorityState'
import { blockHardness, coreHardness } from '../economy/oreEconomy'
import type { BigStat } from '../money'
import { canScratch, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { bandOfTile, isInsidePlanet } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'

export type BotTileKind = 'open' | 'ground' | 'ore' | 'core' | 'pad'

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
  return 'open'
}

export function isInsideWorld(state: AuthorityState, tile: TilePoint): boolean {
  return isInsidePlanet(paramsOfSession(state), tile.tx, tile.ty)
}

export function hardnessAt(params: PlanetParams, tile: TilePoint, kind: BotTileKind): BigStat {
  if (kind === 'core') return coreHardness(params.planetIndex)
  return blockHardness(params.planetIndex, bandOfTile(params, tile.tx, tile.ty))
}

/** #29 Gameplay note 3: the bot never bores a tile its tip only skids on (`P < H/4`). */
export function canBore(
  drill: DrillStats,
  params: PlanetParams,
  tile: TilePoint,
  kind: BotTileKind,
) {
  return kind !== 'pad' && canScratch(drill.drillTip, hardnessAt(params, tile, kind))
}

/** Ticks to break an intact tile, or null when the tip cannot scratch it. */
export function boreTicks(
  drill: DrillStats,
  params: PlanetParams,
  tile: TilePoint,
  kind: BotTileKind,
): number | null {
  if (kind === 'open') return 0
  if (!canBore(drill, params, tile, kind)) return null
  return ticksPerTile(drill, hardnessAt(params, tile, kind))
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
