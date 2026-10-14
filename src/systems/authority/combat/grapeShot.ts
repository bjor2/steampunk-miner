/**
 * Grapeshot (ticket 382, Content's Grapeshot breech on #310): one shot splits across up to
 * `targets` enemies inside a cone of `coneDeg` centred on the bearing to the shot's target. The
 * damage is split, never multiplied, so a shot deals what one shot deals (Systems on #322: no net
 * gain), and each extra target needs its own straight open line from the rig.
 *
 * The cone is tested on integers (#5) as `dot > 0` and `|cross| * den <= num * dot`, with `num / den`
 * at or under the tangent of the half-angle, so the cone is never wider than its width.
 */
import { div, floorMilli, fromSafeInteger, mul, sub, type BigStat } from '../../money'
import type { TurretGrape } from '../../registries/autoGuns'
import type { MillimetrePoint } from './combatGeometry'
import type { Enemy } from './combatState'
import { isNearer, type TurretSight } from './gunTargets'

interface Fraction {
  num: number
  den: number
}

/**
 * tan of half the cone for the widths grapeshot may ask, in degrees. tan 15 degrees is 2 - sqrt 3,
 * irrational: 2679/10000 sits just under it (a half-angle 0.0005 degrees short). Systems fixed the
 * grapeshot cone at 30 (#322 section 6); another width needs its fraction added here.
 */
const HALF_CONE_TAN: Readonly<Record<number, Fraction>> = {
  30: { num: 2679, den: 10000 },
}

export function isGrapeConeWidth(coneDeg: number): boolean {
  return HALF_CONE_TAN[coneDeg] !== undefined
}

/**
 * The other enemies the shot at `primary` splits onto: those in straight sight inside the cone,
 * nearest first, at most `targets - 1` of them.
 */
export function grapePartnersOf(
  sight: TurretSight,
  primary: Enemy,
  inSight: readonly Enemy[],
  grape: TurretGrape,
): Enemy[] {
  const { position } = sight.target
  const cone = HALF_CONE_TAN[grape.coneDeg]
  return inSight
    .filter((enemy) => enemy.id !== primary.id && isInCone(position, primary, enemy, cone))
    .sort((a, b) => (isNearer(position, a, b) ? -1 : 1))
    .slice(0, grape.targets - 1)
}

/**
 * One shot's damage over `targets` enemies: equal shares floored to the money quantum, the
 * remainder on the first, so the shares always add up to the shot's damage exactly.
 */
export function splitShotDamage(damage: BigStat, targets: number): BigStat[] {
  if (targets <= 1) return [damage]
  const share = floorMilli(div(damage, fromSafeInteger(targets)))
  const first = sub(damage, mul(share, fromSafeInteger(targets - 1)))
  return [first, ...Array.from({ length: targets - 1 }, () => share)]
}

function isInCone(
  from: MillimetrePoint,
  primary: MillimetrePoint,
  enemy: MillimetrePoint,
  cone: Fraction,
): boolean {
  const ax = primary.x - from.x
  const ay = primary.y - from.y
  const dx = enemy.x - from.x
  const dy = enemy.y - from.y
  const dot = ax * dx + ay * dy
  return dot > 0 && Math.abs(ax * dy - ay * dx) * cone.den <= cone.num * dot
}
