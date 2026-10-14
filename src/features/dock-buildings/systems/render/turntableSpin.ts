/**
 * How the Works' turntable turns (ticket 395). The art is a flat band, the drum seen side on, so
 * turning it is a remap: a point `share` across the band sits at angle `asin(2 * share - 1)` on
 * the drum, and the rim it shows after a turn is the rim that stood `turn` radians behind. The
 * baked rim repeats every lamp-and-seam period, so only the turn's remainder within a period
 * matters and the remap never samples the drum's hidden back. The band is drawn in vertical
 * strips whose texture coordinates this writes each frame, into the geometry's own array.
 */
import type { AtlasUv } from '../../../../systems/art/assetLook'
import { WORKS_IDLE, type TurntableIdle } from './worksIdle'

const TURN = 2 * Math.PI
const QUARTER_TURN = Math.PI / 2

export interface TurntableSpin {
  /** Radians the drum has turned, kept within one turn. */
  angle: number
  /** Radians per second, eased. */
  speed: number
}

export function createTurntableSpin(): TurntableSpin {
  return { angle: 0, speed: 0 }
}

/**
 * One render step of `dt` seconds: the speed eases to the idle turn, or to a stop while a car
 * stands on the turntable (or motion effects are off), and the angle follows.
 */
export function stepTurntableSpin(
  spin: TurntableSpin,
  isHeld: boolean,
  dt: number,
  turntable: TurntableIdle = WORKS_IDLE.turntable,
): void {
  const target = isHeld ? 0 : TURN / turntable.secondsPerTurn
  spin.speed += (target - spin.speed) * (1 - Math.exp(-dt / turntable.easeSeconds))
  spin.angle = (spin.angle + spin.speed * dt) % TURN
}

export function rimPeriodRadiansOf(turntable: TurntableIdle = WORKS_IDLE.turntable): number {
  return (turntable.rimPeriodDegrees * Math.PI) / 180
}

/**
 * Which share across the baked band a point `share` across the drawn band shows after the drum
 * turned `turn` radians (positive carries the front of the rim to the right).
 */
export function rimShareOf(share: number, turn: number, periodRadians: number): number {
  const shownAngle = Math.asin(Math.min(Math.max(2 * share - 1, -1), 1))
  const bakedAngle = backIntoFront(shownAngle - remainderOf(turn, periodRadians), periodRadians)
  return (Math.sin(bakedAngle) + 1) / 2
}

/**
 * Writes the band's texture coordinates for a turn: `columns + 1` points along the top row, then
 * the same along the bottom, as a PlaneGeometry of `columns` by 1 segments orders them.
 */
export function writeBandUvs(
  uvs: Float32Array,
  columns: number,
  rect: AtlasUv,
  turn: number,
  periodRadians: number,
): void {
  const [left, bottom, right, top] = rect
  for (let column = 0; column <= columns; column++) {
    const u = left + (right - left) * rimShareOf(column / columns, turn, periodRadians)
    writeUv(uvs, column, u, top)
    writeUv(uvs, columns + 1 + column, u, bottom)
  }
}

function writeUv(uvs: Float32Array, point: number, u: number, v: number): void {
  uvs[2 * point] = u
  uvs[2 * point + 1] = v
}

/** The turn within one rim period, in [0, period). */
function remainderOf(turn: number, periodRadians: number): number {
  return ((turn % periodRadians) + periodRadians) % periodRadians
}

/** An angle gone round the left edge to the back shows the same rim one period further on. */
function backIntoFront(angle: number, periodRadians: number): number {
  return angle < -QUARTER_TURN ? angle + periodRadians : angle
}
