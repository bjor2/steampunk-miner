/**
 * The `auto_guns` turret on the run vehicle (#107 visibility, #81 acceptance 3, art #108): the
 * `vehicle-auto-guns` parts, authored in the vehicle's own frame, drawn while the guns are mounted
 * at the look their level has reached. Mount and head stay put; the barrel turns about the
 * trunnion from its rest towards the rear (-X) to the enemy the guns would shoot. Presentation only:
 * the authority picks the real target, this aims at the nearest enemy in range outside the drill's
 * cone, without the line-of-fire test, so it reads right without a terrain walk every frame.
 */
import { GUN_LOOK_FIRST_LEVELS, GUN_TURN_RADIANS_PER_SECOND } from '../../constants/scene'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { ArtCatalogue } from '../art/artCatalogue'
import { slotOfPartId, vehicleModuleAssetIdOf } from '../art/artIds'
import { assetQuadsOf, type AssetQuad } from '../art/assetLook'
import type { Pair } from '../art/partsSidecar'
import type { Enemy } from '../authority/combat/combatState'
import { isInDeadCone } from '../authority/combat/gunTargets'
import { gunRangeTiles } from '../economy/gunStats'
import { majorOf } from '../economy/upgradeSteps'
import type { Facing } from '../vehicle/vehiclePose'

export const GUN_ASSET_ID = vehicleModuleAssetIdOf('auto_guns')

const BARREL_SLOT = 'gun-barrel'
const RANGE_MM = gunRangeTiles() * MM_PER_METRE
const NO_LOOK = 0

/** Where the vehicle is drawn, metres from the planet's centre. */
export interface MetrePoint {
  x: number
  y: number
}

/** 0 with no guns, else 1 to 3 by the breakpoint the gun step's major has reached (#180). */
export function gunLookOf(gunStep: number): number {
  const major = majorOf(gunStep)
  return GUN_LOOK_FIRST_LEVELS.filter((first) => major >= first).length
}

/** The part ids the turret draws at `gunLevel`; none before the mount. */
export function gunPartIdsOf(art: ArtCatalogue, gunLevel: number): string[] {
  return turretQuadsOf(art, gunLevel).map((quad) => quad.partId)
}

/** The mount and the head, which never turn. */
export function gunFixedQuadsOf(art: ArtCatalogue, gunLevel: number): AssetQuad[] {
  return turretQuadsOf(art, gunLevel).filter((quad) => !isBarrel(quad))
}

/** The barrel, centred on the trunnion so one group at `gunTrunnionOf` turns it. */
export function gunBarrelQuadsOf(art: ArtCatalogue, gunLevel: number): AssetQuad[] {
  const trunnion = gunTrunnionOf(art, gunLevel)
  return turretQuadsOf(art, gunLevel)
    .filter(isBarrel)
    .map((quad) => relativeTo(quad, trunnion))
}

/** The barrel's pivot in the vehicle's frame. */
export function gunTrunnionOf(art: ArtCatalogue, gunLevel: number): Pair {
  return turretQuadsOf(art, gunLevel).find(isBarrel)?.pivot ?? [0, 0]
}

/**
 * The barrel's turn from rest, radians in the vehicle's frame, towards the nearest enemy within
 * range outside the drill's cone; null when there is none and the barrel rests. Upright on the
 * radial up, as the body stands. Reuses `frame`, so a frame allocates nothing.
 */
export function gunAimTurnOf(
  at: MetrePoint,
  facing: Facing,
  enemies: readonly Enemy[],
  frame: AimFrame,
): number | null {
  writeAimFrame(at, facing, frame)
  const target = nearestAimableEnemy(frame, enemies)
  return target === null ? null : turnTowards(frame, target)
}

/** The barrel's turn after `dtSeconds` of swinging towards `target` the short way round. */
export function stepGunTurn(current: number, target: number, dtSeconds: number): number {
  const gap = shortestAngle(target - current)
  const reach = GUN_TURN_RADIANS_PER_SECOND * dtSeconds
  return Math.abs(gap) <= reach ? target : current + Math.sign(gap) * reach
}

/** Scratch for `gunAimTurnOf`: the vehicle in mm and its upright frame. */
export interface AimFrame {
  xMm: number
  yMm: number
  upx: number
  upy: number
  facing: Facing
}

export function createAimFrame(): AimFrame {
  return { xMm: 0, yMm: 0, upx: 0, upy: UP_VECTOR_SCALE, facing: 1 }
}

function turretQuadsOf(art: ArtCatalogue, gunLevel: number): AssetQuad[] {
  const look = gunLookOf(gunLevel)
  return look === NO_LOOK ? [] : assetQuadsOf(art, GUN_ASSET_ID, look)
}

function isBarrel(quad: AssetQuad): boolean {
  return slotOfPartId(quad.partId) === BARREL_SLOT
}

function relativeTo(quad: AssetQuad, origin: Pair): AssetQuad {
  return {
    ...quad,
    centre: [quad.centre[0] - origin[0], quad.centre[1] - origin[1]],
    pivot: [quad.pivot[0] - origin[0], quad.pivot[1] - origin[1]],
  }
}

function writeAimFrame(at: MetrePoint, facing: Facing, frame: AimFrame): void {
  const length = Math.hypot(at.x, at.y)
  frame.xMm = Math.round(at.x * MM_PER_METRE)
  frame.yMm = Math.round(at.y * MM_PER_METRE)
  frame.upx = length === 0 ? 0 : Math.round((at.x / length) * UP_VECTOR_SCALE)
  frame.upy = length === 0 ? UP_VECTOR_SCALE : Math.round((at.y / length) * UP_VECTOR_SCALE)
  frame.facing = facing
}

function nearestAimableEnemy(frame: AimFrame, enemies: readonly Enemy[]): Enemy | null {
  let nearest: Enemy | null = null
  let nearestSq = RANGE_MM * RANGE_MM
  for (const enemy of enemies) {
    const dx = enemy.x - frame.xMm
    const dy = enemy.y - frame.yMm
    const distanceSq = dx * dx + dy * dy
    if (distanceSq > nearestSq || isInDeadCone(frame, dx, dy)) continue
    nearest = enemy
    nearestSq = distanceSq
  }
  return nearest
}

/** The enemy's bearing in the vehicle's frame (+X along the tangent, +Y up), less the rest at -X. */
function turnTowards(frame: AimFrame, enemy: Enemy): number {
  const dx = enemy.x - frame.xMm
  const dy = enemy.y - frame.yMm
  const along = dx * frame.upy - dy * frame.upx
  const up = dx * frame.upx + dy * frame.upy
  return shortestAngle(Math.atan2(up, along) - Math.PI)
}

function shortestAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
