/**
 * The kernel's vertical caps on what slice items do to a vehicle (GD lock on #204, ticket 233),
 * `itemEffectCaps` in economy.json:
 *
 * - Motion boosts sum additively in basis points, at most `motionBoostCapBp` (+2000) over the
 *   engine track's lift and drive.
 * - The hull damage intercept multiplies, never below `damageFloorBp` (50%) of the base hit,
 *   collapse crush included. Enemy detection and the heat sink follow the same pattern, with
 *   their own floors.
 * - A tool's trade-off (ticket 848, the GD lock on #823 Q2 as the TD amended it) is a signed
 *   penalty on one owned track while the tool acts, floored at its row's `floorBp`, and no row's
 *   floor may sit below `toolFloorMinBp` (7000: no trade-off past -30%, nothing reaches 0).
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
  toolFloorMinBp: number
}

/** The boosts added together, held to 0 and the cap. */
export function cappedBoostBp(boostsBp: readonly number[], capBp: number): number {
  const total = boostsBp.reduce((sum, boost) => sum + boost, 0)
  return Math.min(capBp, Math.max(0, total))
}

/**
 * The boosts capped as `cappedBoostBp` does, then the trade-off penalties added, never leaving less
 * than `floorBp` of the track (ticket 848): the scale is `max(floorBp, 10000 + bp)`. With no
 * penalty it is exactly the capped boost.
 */
export function boostWithPenaltiesBp(
  boostsBp: readonly number[],
  penaltiesBp: readonly number[],
  capBp: number,
  floorBp: number,
): number {
  const boost = cappedBoostBp(boostsBp, capBp)
  if (penaltiesBp.length === 0) return boost
  const total = penaltiesBp.reduce((sum, penalty) => sum + penalty, boost)
  return Math.max(floorBp - BASIS_POINTS, total)
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
    toolFloorMinBp: readBasisPoints(reader, 'toolFloorMinBp', caps.toolFloorMinBp),
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
