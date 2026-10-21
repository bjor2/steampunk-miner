/**
 * Where a track's look steps land in play (ticket 590; Systems' table on #157, comment
 * 6300543785): each step row names the planet its count was taken from, the one the on-curve player
 * leaves at that count. The rows' planets rise, so a track steps at most once a planet (VS on #157),
 * and in a pacing bot run each step must first show within one planet of its row, and no two steps
 * of a track may first show on the same planet. A miss is Systems' to retune in the row, never the
 * economy's or the bot's.
 */
import type { RigLookStepRow, TrackLookRows } from './render/rigLookIndex'

/** Systems on #157: a step first shows at most this many planets from its row's. */
export const STEP_PLANET_SLACK = 1

/** One upgrade purchase of a run, in run order: the planet it was made on, the count after it. */
export interface TrackPurchase {
  track: string
  planet: number
  toLevel: number
}

/** A step with a planet, and the planet the run first showed it on (null: never). */
export interface StepFirstShown {
  from: number
  rowPlanet: number
  shownOn: number | null
}

/** A track's planets: on every step or none, whole planets from 1, rising step by step. */
export function stepPlanetProblemsOf(rows: TrackLookRows): string[] {
  const planned = rows.steps.filter(hasPlanet)
  if (planned.length === 0) return []
  if (planned.length < rows.steps.length) return ['names a planet on some steps, not all']
  return planned.flatMap((step, at) => planetProblemsOf(step, planned[at - 1]))
}

/** Each step of `rows` that names a planet, and where `purchases` first reached its count. */
export function stepsFirstShownOf(
  rows: TrackLookRows,
  purchases: readonly TrackPurchase[],
): StepFirstShown[] {
  const own = purchases.filter((purchase) => purchase.track === rows.track)
  return rows.steps.filter(hasPlanet).map((step) => ({
    from: step.from,
    rowPlanet: step.planet,
    shownOn: own.find((purchase) => purchase.toLevel >= step.from)?.planet ?? null,
  }))
}

/**
 * Every way a run misses `rows`: a step first shown more than one planet from its row, a step
 * never shown though the run finished the last planet it could show on, and two steps first shown
 * on one planet. `lastFinishedPlanet` is the highest planet whose core the run completed.
 */
export function stepPlanetMissesOf(
  rows: TrackLookRows,
  purchases: readonly TrackPurchase[],
  lastFinishedPlanet: number,
): string[] {
  const shown = stepsFirstShownOf(rows, purchases)
  return [
    ...shown.flatMap((step) => stepMissesOf(step, lastFinishedPlanet)),
    ...sharedPlanetMissesOf(shown),
  ].map((miss) => `${rows.track}: ${miss}`)
}

function hasPlanet(step: RigLookStepRow): step is RigLookStepRow & { planet: number } {
  return step.planet !== undefined
}

function planetProblemsOf(step: RigLookStepRow & { planet: number }, before?: RigLookStepRow) {
  const problems: string[] = []
  if (!Number.isInteger(step.planet) || step.planet < 1) problems.push('planet is not from 1')
  if (before?.planet !== undefined && step.planet <= before.planet) {
    problems.push('planet does not rise')
  }
  return problems.map((problem) => `step from ${step.from}: ${problem}`)
}

function stepMissesOf(step: StepFirstShown, lastFinishedPlanet: number): string[] {
  const place = `step from ${step.from} (P${step.rowPlanet})`
  if (step.shownOn === null) {
    const isOverdue = lastFinishedPlanet >= step.rowPlanet + STEP_PLANET_SLACK
    return isOverdue ? [`${place} never shows by P${lastFinishedPlanet}'s core`] : []
  }
  const isTooFar = Math.abs(step.shownOn - step.rowPlanet) > STEP_PLANET_SLACK
  return isTooFar ? [`${place} first shows on P${step.shownOn}`] : []
}

function sharedPlanetMissesOf(shown: readonly StepFirstShown[]): string[] {
  const planets = shown.flatMap((step) => (step.shownOn === null ? [] : [step.shownOn]))
  const twice = [...new Set(planets.filter((planet, at) => planets.indexOf(planet) !== at))]
  return twice.map((planet) => `steps twice on P${planet}`)
}
