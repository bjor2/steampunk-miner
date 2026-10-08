/**
 * The repulsor coil (GD lock on #246, the repel verb; ticket 284): one push-wave per slot tap. When
 * the wind-up ends the wave leaves the vehicle and, within its radius (the Mark magnitude, whole
 * tiles from the vehicle's tile), pushes every cell and metal enemy it reaches one cell outward:
 *
 * - Cells go through the kernel's magnet shift (`shiftCellsByMagnet`, #283), nearest the vehicle
 *   first, each into the touching open cell nearest the line out from the vehicle. The shift keeps
 *   the lock's caps: at most 8 diggable cells, conserved, never a gated, core or lava cell, none of
 *   the 1 m anchors, each paid at its own dig energy. The coil asks nothing over that floor. The
 *   moves join the K6 queue on the act's tick and the first lands on the next.
 * - Metal enemies (#291's tag) move one cell out on the act's tick (`pushMetalEnemies`).
 * - The vehicle itself is never pushed, so the #233 motion cap is never reached.
 *
 * "Loose rubble" is ground the drill can dig: a collapse refills its block as plain ground, and no
 * other loose body exists. A wave that moves nothing is refused and costs nothing.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { pushMetalEnemies, type PushWave } from '../../../systems/authority/magnet/enemyPush'
import {
  shiftCellsByMagnet,
  type MagnetPush,
  type MagnetShift,
} from '../../../systems/authority/magnet/shiftCellsByMagnet'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { ECONOMY } from '../../../systems/economy/economy'
import { tileOfMillimetres } from '../../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { tilesNearestFirst, tilesOutwardOf } from './editGeometry'
import { editSeedOf } from './editSeed'
import { magnetBalanceOf, magnetItemOf, type MagnetItem } from './magnetItems'
import { magnetUsedOf, TERRAIN_REFUSAL } from './terrainEvents'
import { editSourceOf } from './terrainOutcome'

export const REPULSOR_COIL_ID = 'power.repulsor_coil'

/** The coil's own energy per moved cell: none over the cell's dig energy, the lock's floor. */
const ASKED_QUANTA_PER_CELL = 0

/** One wave as it fires: the use, the planet, and where the wave starts. */
interface FiredWave {
  use: PowerUpUse
  params: PlanetParams
  /** The vehicle's tile; the wave's radius counts from it. */
  centre: TilePoint
  enemyWave: PushWave
}

/** What one wave moved. */
interface WaveResult {
  state: AuthorityState
  shift: MagnetShift
  enemiesPushed: number
}

/** The push-wave: cells and metal enemies one cell out; refused when nothing moves. */
export function releasePushWave(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const wave = firedWaveOf(state, use)
  if (wave === null) return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
  return outcomeOfWave(use, pushWithWave(state, wave))
}

function firedWaveOf(state: AuthorityState, use: PowerUpUse): FiredWave | null {
  const params = planetParamsOf(state.planet)
  const pose = vehicleOf(state, use.playerId).pose
  if (params === null || pose === null) return null
  const radiusTiles = radiusOf(use)
  const centre = tileOfMillimetres(pose.x, pose.y)
  return {
    use,
    params,
    centre,
    enemyWave: { centre: { x: pose.x, y: pose.y }, radiusTiles, tick: use.tick },
  }
}

/** The wave's radius at the use's Mark; the bought radius for an item read without one. */
function radiusOf(use: PowerUpUse): number {
  return use.magnitude ?? magnetBalanceOf(repulsorCoil()).magnitude
}

function pushWithWave(state: AuthorityState, wave: FiredWave): WaveResult {
  const shifted = shiftCellsByMagnet(state, {
    playerId: wave.use.playerId,
    source: editSourceOf(wave.use.itemId),
    pushes: wavePushesOf(wave),
    askedQuantaPerCell: ASKED_QUANTA_PER_CELL,
  })
  const terrain = { world: shifted.state.world, params: wave.params }
  const pushed = pushMetalEnemies(shifted.state, terrain, wave.enemyWave, ECONOMY.enemies.metal)
  return { state: pushed.state, shift: shifted.shift, enemiesPushed: pushed.pushedIds.length }
}

/** Every tile the wave reaches, nearest the vehicle first, each pushed one cell further out. */
function wavePushesOf(wave: FiredWave): MagnetPush[] {
  const { use, params, centre } = wave
  const seed = editSeedOf(params, {
    origin: centre,
    tick: use.tick,
    itemId: use.itemId,
    mark: use.mark,
  })
  return tilesNearestFirst(centre, wave.enemyWave.radiusTiles, seed)
    .map((from) => ({ from, to: tilesOutwardOf(from, centre) }))
    .filter((push) => push.to.length > 0)
}

function outcomeOfWave(use: PowerUpUse, result: WaveResult): PowerUpOutcome {
  if (result.shift.moved.length === 0 && result.enemiesPushed === 0) {
    return { kind: 'refused', reason: TERRAIN_REFUSAL.nothingToPush }
  }
  const used = magnetUsedOf({
    playerId: use.playerId,
    itemId: use.itemId,
    verb: repulsorCoil().verb,
    cellsMoved: result.shift.moved.length,
    energy: result.shift.energyQuanta,
  })
  return { kind: 'acted', effect: { state: result.state, events: [used] } }
}

function repulsorCoil(): MagnetItem {
  const item = magnetItemOf(REPULSOR_COIL_ID)
  if (item === null) throw new RangeError(`no ${REPULSOR_COIL_ID} row`)
  return item
}
