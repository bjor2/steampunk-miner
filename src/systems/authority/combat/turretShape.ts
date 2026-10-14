/**
 * The turret's shape for a due shot (ticket 382, the TD lock on #319): the `autoGuns` provider's
 * answer held to `gun.turretCaps`, or #107's guns when it has none. The kernel reads it once per
 * due shot in `fireGun` and throws for any field outside its cap, so a bad module can never shoot
 * further, cheaper or wider than Systems allows.
 *
 * Fold (one provider, done slice-side with `foldTurretShapes`): the strongest of each field, never
 * a sum. That is the largest number everywhere except energy per shot, where the cheapest is the
 * strongest: Extended barrels' past-cap stat is the only module that moves it, and a largest-value
 * fold would undo it whenever another module answered the full shot. `'director'` wins over
 * `'nearest'`; the nullable groups take the largest of each of their fields.
 */
import { ECONOMY } from '../../economy/economy'
import { gunRangeTiles } from '../../economy/gunStats'
import {
  providedTurretShapeOf,
  type TurretBurst,
  type TurretGrape,
  type TurretKnock,
  type TurretShape,
} from '../../registries/autoGuns'
import { GUN_SHOT_FLOOR_QUANTA, GUN_SHOT_QUANTA } from '../../vehicle/energyQuanta'
import type { AuthorityState } from '../authorityState'
import { isGrapeConeWidth } from './grapeShot'

const CAPS = ECONOMY.gun.turretCaps

/** #107's guns: their range, a full shot's energy, the nearest enemy, and nothing more. */
export const BASE_TURRET_SHAPE: TurretShape = {
  rangeTiles: gunRangeTiles(),
  energyPerShotQuanta: GUN_SHOT_QUANTA,
  targetOrder: 'nearest',
  retargetTicks: 0,
  forwardConeAfterTicks: null,
  knock: null,
  grape: null,
  burst: null,
  bounceLegCells: null,
}

/** The shape this player's guns shoot with now, held to the caps; #107's with no provider. */
export function turretShapeOf(state: AuthorityState, playerId: string): TurretShape {
  const shape = providedTurretShapeOf(state, playerId)
  return shape === null ? BASE_TURRET_SHAPE : checkedTurretShape(shape)
}

/** The shape itself when every field is whole and inside its cap; anything else throws. */
export function checkedTurretShape(shape: TurretShape): TurretShape {
  const problems = turretShapeProblems(shape)
  if (problems.length > 0) throw new RangeError(`bad turret shape: ${problems.join('; ')}`)
  return shape
}

/** One shape for all of the turret's modules: the strongest of each, never a sum; null for none. */
export function foldTurretShapes(shapes: readonly TurretShape[]): TurretShape | null {
  if (shapes.length === 0) return null
  return {
    rangeTiles: largestOf(shapes.map((shape) => shape.rangeTiles)),
    energyPerShotQuanta: Math.min(...shapes.map((shape) => shape.energyPerShotQuanta)),
    targetOrder: shapes.some((shape) => shape.targetOrder === 'director') ? 'director' : 'nearest',
    retargetTicks: largestOf(shapes.map((shape) => shape.retargetTicks)),
    forwardConeAfterTicks: largestPresentOf(shapes.map((shape) => shape.forwardConeAfterTicks)),
    knock: foldedKnockOf(shapes.map((shape) => shape.knock)),
    grape: foldedGrapeOf(shapes.map((shape) => shape.grape)),
    burst: foldedBurstOf(shapes.map((shape) => shape.burst)),
    bounceLegCells: largestPresentOf(shapes.map((shape) => shape.bounceLegCells)),
  }
}

function turretShapeProblems(shape: TurretShape): string[] {
  return [
    ...wholeWithinProblems('rangeTiles', shape.rangeTiles, 1, CAPS.gunRangeCap),
    ...wholeWithinProblems(
      'energyPerShotQuanta',
      shape.energyPerShotQuanta,
      GUN_SHOT_FLOOR_QUANTA,
      GUN_SHOT_QUANTA,
    ),
    ...targetOrderProblems(shape.targetOrder),
    ...wholeWithinProblems('retargetTicks', shape.retargetTicks, 0),
    ...optionalWithinProblems('forwardConeAfterTicks', shape.forwardConeAfterTicks, 0),
    ...knockProblems(shape.knock),
    ...grapeProblems(shape.grape),
    ...burstProblems(shape.burst),
    ...optionalWithinProblems('bounceLegCells', shape.bounceLegCells, 1, CAPS.maxBounceLegCells),
  ]
}

function targetOrderProblems(order: string): string[] {
  if (order === 'nearest' || order === 'director') return []
  return [`targetOrder is ${order}, not nearest or director`]
}

function knockProblems(knock: TurretKnock | null): string[] {
  if (knock === null) return []
  return [
    ...wholeWithinProblems('knock.cells', knock.cells, 1, CAPS.maxKnockCells),
    ...wholeWithinProblems('knock.cooldownTicks', knock.cooldownTicks, 0),
  ]
}

function grapeProblems(grape: TurretGrape | null): string[] {
  if (grape === null) return []
  const cone = isGrapeConeWidth(grape.coneDeg)
    ? []
    : [`grape.coneDeg ${grape.coneDeg} has no exact cone in grapeShot.ts`]
  return [...wholeWithinProblems('grape.targets', grape.targets, 1, CAPS.maxGrapeTargets), ...cone]
}

function burstProblems(burst: TurretBurst | null): string[] {
  if (burst === null) return []
  const fields = [
    ...wholeWithinProblems('burst.burstTicks', burst.burstTicks, 1),
    ...wholeWithinProblems('burst.ventTicks', burst.ventTicks, 0),
    ...wholeWithinProblems('burst.intervalDenominator', burst.intervalDenominator, 1),
    ...wholeWithinProblems(
      'burst.intervalNumerator',
      burst.intervalNumerator,
      1,
      burst.intervalDenominator,
    ),
  ]
  return fields.length > 0 ? fields : burstNetRateProblems(burst)
}

/**
 * A burst cycle fires `denominator / numerator` times the track's shots over `burstTicks` and none
 * over `ventTicks`, so it never beats the track while `denominator * burst <= numerator * cycle`
 * (Content's check on #319, `isOverpressureNetRateHeld` in the ground-gun slice).
 */
function burstNetRateProblems(burst: TurretBurst): string[] {
  const { burstTicks, ventTicks, intervalNumerator, intervalDenominator } = burst
  if (intervalDenominator * burstTicks <= intervalNumerator * (burstTicks + ventTicks)) return []
  return [`burst fires more shots a cycle than the gun track: ${JSON.stringify(burst)}`]
}

/** A whole number from `least` to `cap` (no cap when left out). */
function wholeWithinProblems(
  field: string,
  value: number,
  least: number,
  cap: number = Number.MAX_SAFE_INTEGER,
): string[] {
  if (Number.isSafeInteger(value) && value >= least && value <= cap) return []
  return [`${field} is ${value}, not a whole number from ${least} to ${cap}`]
}

function optionalWithinProblems(
  field: string,
  value: number | null,
  least: number,
  cap?: number,
): string[] {
  return value === null ? [] : wholeWithinProblems(field, value, least, cap)
}

function foldedKnockOf(knocks: readonly (TurretKnock | null)[]): TurretKnock | null {
  const present = knocks.filter((knock): knock is TurretKnock => knock !== null)
  if (present.length === 0) return null
  return {
    cells: largestOf(present.map((knock) => knock.cells)),
    cooldownTicks: largestOf(present.map((knock) => knock.cooldownTicks)),
  }
}

function foldedGrapeOf(grapes: readonly (TurretGrape | null)[]): TurretGrape | null {
  const present = grapes.filter((grape): grape is TurretGrape => grape !== null)
  if (present.length === 0) return null
  return {
    targets: largestOf(present.map((grape) => grape.targets)),
    coneDeg: largestOf(present.map((grape) => grape.coneDeg)),
  }
}

function foldedBurstOf(bursts: readonly (TurretBurst | null)[]): TurretBurst | null {
  const present = bursts.filter((burst): burst is TurretBurst => burst !== null)
  if (present.length === 0) return null
  return {
    burstTicks: largestOf(present.map((burst) => burst.burstTicks)),
    ventTicks: largestOf(present.map((burst) => burst.ventTicks)),
    intervalNumerator: largestOf(present.map((burst) => burst.intervalNumerator)),
    intervalDenominator: largestOf(present.map((burst) => burst.intervalDenominator)),
  }
}

function largestOf(values: readonly number[]): number {
  return Math.max(0, ...values)
}

function largestPresentOf(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null)
  return present.length === 0 ? null : largestOf(present)
}
