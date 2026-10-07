/**
 * The kernel's vertical caps on what slice items do to a vehicle (GD lock on #204, ticket 233),
 * `itemEffectCaps` in economy.json:
 *
 * - Motion boosts sum additively in basis points, at most `motionBoostCapBp` (+2000) over the
 *   engine track's lift and drive.
 * - The hull damage intercept multiplies, never below `damageFloorBp` (50%) of the base hit,
 *   collapse crush included. Enemy detection and the heat sink follow the same pattern, with
 *   their own floors.
 *
 * A slice states its effect; the kernel folds every registered one through these rules, so no
 * stack of items passes the caps.
 */
import { BASIS_POINTS } from '../../constants/balance'
import type { FieldReader } from './economyFieldReader'

export interface ItemEffectCaps {
  motionBoostCapBp: number
  damageFloorBp: number
  detectionFloorBp: number
  heatFloorBp: number
}

/** The boosts added together, held to 0 and the cap. */
export function cappedBoostBp(boostsBp: readonly number[], capBp: number): number {
  const total = boostsBp.reduce((sum, boost) => sum + boost, 0)
  return Math.min(capBp, Math.max(0, total))
}

/**
 * The scales multiplied together, each held to 0..1 and rounded down after each step, never
 * below `floorBp`. No scales is the whole base.
 */
export function flooredScaleBp(scalesBp: readonly number[], floorBp: number): number {
  const product = scalesBp.reduce(
    (scale, next) => Math.floor((scale * asShare(next)) / BASIS_POINTS),
    BASIS_POINTS,
  )
  return Math.max(floorBp, product)
}

export function readItemEffectCaps(reader: FieldReader, value: unknown): ItemEffectCaps {
  const caps = reader.object('itemEffectCaps', value)
  return {
    motionBoostCapBp: readBasisPoints(reader, 'motionBoostCapBp', caps.motionBoostCapBp),
    damageFloorBp: readBasisPoints(reader, 'damageFloorBp', caps.damageFloorBp),
    detectionFloorBp: readBasisPoints(reader, 'detectionFloorBp', caps.detectionFloorBp),
    heatFloorBp: readBasisPoints(reader, 'heatFloorBp', caps.heatFloorBp),
  }
}

function asShare(scaleBp: number): number {
  return Math.min(BASIS_POINTS, Math.max(0, Math.floor(scaleBp)))
}

function readBasisPoints(reader: FieldReader, name: string, value: unknown): number {
  const path = `itemEffectCaps.${name}`
  const points = reader.safeInteger(path, value)
  if (points < 0 || points > BASIS_POINTS) {
    reader.record(`${path} must be 0 to ${BASIS_POINTS} basis points`)
  }
  return points
}
