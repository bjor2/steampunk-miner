/**
 * The upgrade plaque's fitting fact (TD ruling on #579, folded into ticket 585; GD lock 6306384872;
 * Content on #157, comment 6300549964): a track whose look rows carry a plaque template names the
 * step the player owns, `Fitting: {stepName}`, and above the top step adds the tail grade,
 * ` · Grade N`, so the copy never runs out. The step itself never shows a grade, and a count below
 * the first step names nothing: the plaque never names a step the player does not own. Grade N is
 * the tail step reached (Grade 1 on the first purchase past the top step), from the owned purchase
 * count the save holds, uncapped as the look laps; shown in full up to 9999, then cut with integer
 * maths to one decimal and a unit (12.3k), never a float format, so it fits a 360 px plaque.
 */
import {
  rigLookIndexOf,
  type RigLookIndex,
  type RigLookPlaque,
  type TrackLookRows,
} from './render/rigLookIndex'

const STEP_NAME = '{stepName}'
const GRADE = '{grade}'

/** The largest grade shown in full (VS on #579). */
const FULL_GRADE_MAX = 9999

/** The units a larger grade is cut to, largest first. */
const GRADE_UNITS: readonly { size: number; suffix: string }[] = [
  { size: 1_000_000_000, suffix: 'B' },
  { size: 1_000_000, suffix: 'M' },
  { size: 1_000, suffix: 'k' },
]

/** The fitting fact `n` owned purchases show on the plaque; null with no template or no step. */
export function plaqueFactOf(rows: TrackLookRows, n: number): string | null {
  if (rows.plaque === undefined) return null
  return fittingFactAt(rows, rows.plaque, rigLookIndexOf(rows, n))
}

function fittingFactAt(
  rows: TrackLookRows,
  plaque: RigLookPlaque,
  { step, tail }: RigLookIndex,
): string | null {
  if (step === 0) return null
  const template = tail === 0 ? plaque.step : plaque.tail
  const stepName = rows.steps[step - 1].card ?? ''
  return template.replace(STEP_NAME, stepName).replace(GRADE, tailGradeTextOf(tail))
}

/** A whole grade as the plaque shows it: `9999`, then `10k`, `12.3k`, `1M`, `2.1B`. */
export function tailGradeTextOf(grade: number): string {
  if (grade <= FULL_GRADE_MAX) return `${grade}`
  const { size, suffix } = GRADE_UNITS.find((unit) => grade >= unit.size)!
  return cutGradeTextOf(grade, size, suffix)
}

/** `grade` in tenths of `size`, truncated: integer division only. */
function cutGradeTextOf(grade: number, size: number, suffix: string): string {
  const tenths = Math.floor(grade / (size / 10))
  const whole = Math.floor(tenths / 10)
  const tenth = tenths % 10
  return tenth === 0 ? `${whole}${suffix}` : `${whole}.${tenth}${suffix}`
}

/** Why a plaque template cannot load: its placeholders each once, and every step named. */
export function plaqueProblemsOf(rows: TrackLookRows): string[] {
  if (rows.plaque === undefined) return []
  return [
    ...placeholderProblemsOf('plaque step', rows.plaque.step, [STEP_NAME], [GRADE]),
    ...placeholderProblemsOf('plaque tail', rows.plaque.tail, [STEP_NAME, GRADE], []),
    ...unnamedStepProblemsOf(rows),
  ]
}

function placeholderProblemsOf(
  name: string,
  template: string,
  needed: readonly string[],
  refused: readonly string[],
): string[] {
  const missing = needed.filter((placeholder) => !isShownOnce(template, placeholder))
  const extra = refused.filter((placeholder) => template.includes(placeholder))
  return [
    ...missing.map((placeholder) => `${name} needs ${placeholder} once`),
    ...extra.map((placeholder) => `${name} may not show ${placeholder}`),
  ]
}

function isShownOnce(template: string, placeholder: string): boolean {
  return template.split(placeholder).length === 2
}

function unnamedStepProblemsOf(rows: TrackLookRows): string[] {
  const unnamed = rows.steps.filter((step) => step.card === null)
  return unnamed.map((step) => `step from ${step.from}: no card for the plaque`)
}
