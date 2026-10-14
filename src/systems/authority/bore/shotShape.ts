/**
 * A shot's shape (ticket 377, the TD lock on #318): the aimed line plus offset lines, each with at
 * most `seamTurns` same-ore turns, all spending the shot's one dig budget. The ground-gun slice
 * folds its signature modules into one `ShotShape` (`foldShotShapes`); the kernel reads it once per
 * shot and refuses, by throwing, any shape outside the caps in `boreBearings.json`, so a bad
 * module can never bore a wider or longer shot than Systems allows.
 *
 * Fold (one provider): offsets are unioned, de-duplicated and sorted; turns, extra energy and the
 * tick fields take the largest, never a sum; the lining takes the highest casing_cement grade.
 *
 * A shape with `strutTicks` also needs the strut's reinforcement registered (ticket 379,
 * `boreStrut.ts`), so a strut always reaches collapse through the #157 registry.
 */
import { cementGradeOf } from '../../economy/casingPrices'
import { ECONOMY } from '../../economy/economy'
import { liningTypes } from '../../economy/heatEconomy'
import { providedShotShapeOf, type ShotShape } from '../../registries/boreGun'
import { liningRowIdOf } from '../../vehicle/liningType'
import type { AuthorityState } from '../authorityState'
import { isStrutReinforcementRegistered } from './boreStrut'
import BORE_BEARINGS from './boreBearings.json'

export interface ShotShapeCaps {
  /** Lines per shot, the aimed one included. */
  maxLines: number
  /** Seam turns per line. */
  maxSeamTurns: number
}

export const SHOT_SHAPE_CAPS: ShotShapeCaps = BORE_BEARINGS.shotShapeCaps

/** The provider's shape for this player's shot, held to the caps; null for a single line. */
export function shotShapeOf(state: AuthorityState, playerId: string): ShotShape | null {
  const shape = providedShotShapeOf(state, playerId)
  return shape === null ? null : checkedShotShape(shape)
}

/** The shape itself when every field is whole and inside its cap; anything else throws. */
export function checkedShotShape(shape: ShotShape): ShotShape {
  const problems = shotShapeProblems(shape)
  if (problems.length > 0) throw new RangeError(`bad shot shape: ${problems.join('; ')}`)
  return shape
}

/** One shape for all of a gun's modules: the strongest of each, never a sum; null for none. */
export function foldShotShapes(shapes: readonly ShotShape[]): ShotShape | null {
  if (shapes.length === 0) return null
  return {
    lineOffsets: unionOfOffsets(shapes),
    seamTurns: largestOf(shapes.map((shape) => shape.seamTurns)),
    liningGrade: highestLiningGradeOf(shapes),
    extraEnergyPerCellBp: largestOf(shapes.map((shape) => shape.extraEnergyPerCellBp)),
    groundTicks: largestTicksOf(shapes.map((shape) => shape.groundTicks)),
    strutTicks: largestTicksOf(shapes.map((shape) => shape.strutTicks)),
  }
}

/** The lining type a casing_cement grade's row lays, or null for a row no laid type has. */
export function liningTypeOfGrade(gradeRowId: string): string | null {
  return liningTypes().find((liningType) => isGradeRowOf(liningType, gradeRowId)) ?? null
}

function shotShapeProblems(shape: ShotShape): string[] {
  return [
    ...lineOffsetProblems(shape.lineOffsets),
    ...wholeWithinProblems('seamTurns', shape.seamTurns, SHOT_SHAPE_CAPS.maxSeamTurns),
    ...wholeWithinProblems('extraEnergyPerCellBp', shape.extraEnergyPerCellBp),
    ...optionalTicksProblems('groundTicks', shape.groundTicks),
    ...optionalTicksProblems('strutTicks', shape.strutTicks),
    ...strutReinforcementProblems(shape.strutTicks),
    ...liningGradeProblems(shape.liningGrade),
  ]
}

function lineOffsetProblems(offsets: readonly number[]): string[] {
  const extraLines = SHOT_SHAPE_CAPS.maxLines - 1
  const tooMany =
    offsets.length > extraLines
      ? [`lineOffsets holds ${offsets.length} lines past the aimed one, the cap is ${extraLines}`]
      : []
  const notWhole = offsets
    .filter((offset) => !Number.isSafeInteger(offset))
    .map((offset) => `lineOffsets holds ${offset}, not a whole number of bearing steps`)
  return [...tooMany, ...notWhole]
}

/** A whole number from 0 to `cap` (no cap when left out). */
function wholeWithinProblems(
  field: string,
  value: number,
  cap: number = Number.MAX_SAFE_INTEGER,
): string[] {
  if (Number.isSafeInteger(value) && value >= 0 && value <= cap) return []
  return [`${field} is ${value}, not a whole number from 0 to ${cap}`]
}

function optionalTicksProblems(field: string, ticks: number | null): string[] {
  return ticks === null ? [] : wholeWithinProblems(field, ticks)
}

/** Struts reach collapse only through the #157 registry, so a strut shape needs it answering. */
function strutReinforcementProblems(strutTicks: number | null): string[] {
  if (strutTicks === null || isStrutReinforcementRegistered()) return []
  return ['strutTicks is set, but no groundReinforcement provider answers with strutReinforces']
}

function liningGradeProblems(gradeRowId: string | null): string[] {
  if (gradeRowId === null || liningTypeOfGrade(gradeRowId) !== null) return []
  return [`liningGrade ${gradeRowId} is not a casing_cement grade with a lining type`]
}

function isGradeRowOf(liningType: string, gradeRowId: string): boolean {
  return cementGradeOf(liningType) !== null && liningRowIdOf(liningType) === gradeRowId
}

function unionOfOffsets(shapes: readonly ShotShape[]): number[] {
  const offsets = new Set(shapes.flatMap((shape) => shape.lineOffsets))
  return [...offsets].sort((a, b) => a - b)
}

function largestOf(values: readonly number[]): number {
  return Math.max(0, ...values)
}

function largestTicksOf(values: readonly (number | null)[]): number | null {
  const ticks = values.filter((value): value is number => value !== null)
  return ticks.length === 0 ? null : largestOf(ticks)
}

/** The highest casing_cement grade any shape names; a row that is no grade ranks lowest. */
function highestLiningGradeOf(shapes: readonly ShotShape[]): string | null {
  return shapes
    .map((shape) => shape.liningGrade)
    .filter((gradeRowId): gradeRowId is string => gradeRowId !== null)
    .reduce<string | null>(
      (highest, gradeRowId) =>
        highest === null || gradeRankOf(gradeRowId) > gradeRankOf(highest) ? gradeRowId : highest,
      null,
    )
}

/** Grade 1 first, as casing_cement lists its grades; 0 for a row that is none of them. */
function gradeRankOf(gradeRowId: string): number {
  const grades = ECONOMY.casing.cementGrades.liningTypes
  return grades.findIndex((liningType) => liningRowIdOf(liningType) === gradeRowId) + 1
}
