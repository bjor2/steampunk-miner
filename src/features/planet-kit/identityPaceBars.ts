/**
 * The bars of the PK7 per-planet identity gate (ticket 826; the GD lock of 24 Oct on per-planet
 * identity P1-P5: the VS and Systems rows 0-5 and the HS points), each on the median of the pacing
 * seeds (#84), planets 1 to 5, merchants off (the bare bot) against merchants on:
 *
 *   skip-all  merchants off passes every pacing row: 22 to 30 minutes a planet, drill + tip majors
 *             3.5 to 7 and felt speed at least 0.9x the planet before on P2-P5, money per minute
 *             within 5% of the #551 equilibrium step (R3's bars), and nothing bought at a merchant
 *   paired    merchants on keeps each planet's minutes and felt speed within 5% of off, and its
 *             minutes inside today's 22-30 band wherever off holds it
 *   decision  on every seed each planet's merchant sells it its own item, a different one on each
 *             planet: the Cache Crate on P1, the local tool or consumable on P2-P5
 *   off-curve each kit item at most 6% of the money the run spent, all of them at most 12%
 *   signature the planet's premium ore mined on the first trip after the jump in, P2-P5
 *
 * The ore-premium backtrack bar is off the curve, not a run (`systems/premiumBacktrack.ts`). A miss
 * is a balance finding for the kit item's price or effect in data, never the bot, #551 or the
 * cargo curve (VS).
 */
import { RADIUS_REBASELINE_BARS } from '../../logging/radiusRebaselineBars'
import { equilibriumRateStepOf } from '../../logging/radiusRebaselineMedians'
import { decisionOf } from './identityTrace'
import {
  firstTripUnitsOf,
  IDENTITY_PLANETS,
  identityPlanetRowsOf,
  localItemIdOf,
  medianOf,
  minutesText,
  offCurveShareBpOf,
  type IdentityPlanetRow,
  type Paired,
} from './identityPaceRows'
import type { IdentityPaceRun } from './identityPaceRuns'

export const IDENTITY_PACE_BARS = {
  planetMinutes: RADIUS_REBASELINE_BARS.planetMinutes,
  feltRatioToPreviousMin: RADIUS_REBASELINE_BARS.feltRatioToPreviousMin,
  firstCadencePlanet: RADIUS_REBASELINE_BARS.firstCadencePlanet,
  drillTipMajorsPerPlanet: RADIUS_REBASELINE_BARS.drillTipMajorsPerPlanet,
  moneyRateToEquilibrium: RADIUS_REBASELINE_BARS.moneyRateToEquilibrium,
  pStar: RADIUS_REBASELINE_BARS.pStar.target,
  pairedToleranceBp: 500,
  offCurveLineBpMax: 600,
  offCurveCombinedBpMax: 1200,
  firstJumpPlanet: 2,
} as const

const BASIS_POINTS = 10000

/** The gated bars as problems; empty when they hold. */
export function identityPaceProblemsOf(
  off: readonly IdentityPaceRun[],
  on: readonly IdentityPaceRun[],
): string[] {
  const rows = identityPlanetRowsOf(off, on)
  return [
    ...rows.flatMap((row, at) => skipAllMerchantsProblems(row, rows[at - 1])),
    ...off.flatMap(merchantBuyProblems),
    ...rows.flatMap(pairedProblems),
    ...rows.flatMap((row) => decisionProblems(row, on)),
    ...distinctDecisionProblems(rows),
    ...offCurveProblems(on),
    ...rows.flatMap((row) => signatureProblems(row, on)),
  ]
}

function skipAllMerchantsProblems(
  row: IdentityPlanetRow,
  before: IdentityPlanetRow | undefined,
): string[] {
  return [
    ...offMinutesProblems(row),
    ...offFeltProblems(row, before),
    ...offCadenceProblems(row),
    ...offMoneyStepProblems(row),
  ]
}

function offMinutesProblems({ planet, minutes }: IdentityPlanetRow): string[] {
  if (isInMinutesBand(minutes.off)) return []
  return [
    `skip-all-merchants: planet ${planet} takes ${minutesText(minutes.off)} min, outside 22 to 30`,
  ]
}

function offFeltProblems(
  { planet, felt }: IdentityPlanetRow,
  before: IdentityPlanetRow | undefined,
): string[] {
  const ratio = numberStepOf(felt.off, before?.felt.off ?? null)
  if (ratio === null || ratio >= IDENTITY_PACE_BARS.feltRatioToPreviousMin) return []
  return [
    `skip-all-merchants: planet ${planet} felt speed ${ratio.toFixed(2)}x the planet before, under 0.9`,
  ]
}

function offCadenceProblems({ planet, drillTipMajors }: IdentityPlanetRow): string[] {
  const { min, max } = IDENTITY_PACE_BARS.drillTipMajorsPerPlanet
  const majors = drillTipMajors.off
  if (planet < IDENTITY_PACE_BARS.firstCadencePlanet) return []
  if (majors !== null && majors >= min && majors <= max) return []
  return [
    `skip-all-merchants: planet ${planet} lands ${majors ?? 'no'} drill + tip majors, outside 3.5 to 7.0`,
  ]
}

function offMoneyStepProblems({ planet, moneyStep }: IdentityPlanetRow): string[] {
  if (planet === 1 || isNearEquilibrium(planet, moneyStep.off)) return []
  return [
    `skip-all-merchants: planet ${planet} money per minute x${moneyStep.off?.toFixed(2) ?? 'never'} ` +
      `the planet before, outside 5% of the #551 x${equilibriumOf(planet).toFixed(2)}`,
  ]
}

function merchantBuyProblems(run: IdentityPaceRun): string[] {
  return [...run.trace.planets.values()]
    .filter((planet) => planet.kitBuys.size > 0)
    .map(
      (planet) =>
        `skip-all-merchants: seed ${run.worldSeed} bought ${decisionOf(planet).join(', ')} on planet ${planet.planet}`,
    )
}

function pairedProblems(row: IdentityPlanetRow): string[] {
  return [
    ...pairedNumberProblems(row.planet, 'minutes', row.minutes),
    ...pairedNumberProblems(row.planet, 'felt speed', row.felt),
    ...todayBandProblems(row),
  ]
}

function pairedNumberProblems(planet: number, what: string, pair: Paired<number | null>): string[] {
  if (isWithinPaired(pair)) return []
  return [
    `merchants on: planet ${planet} ${what} ${numberText(pair.on)}, outside 5% of off's ${numberText(pair.off)}`,
  ]
}

/** Time-to-core stays in today's band: a planet off already misses is the bare bot's finding. */
function todayBandProblems({ planet, minutes }: IdentityPlanetRow): string[] {
  if (isInMinutesBand(minutes.on) || !isInMinutesBand(minutes.off)) return []
  return [`merchants on: planet ${planet} takes ${minutesText(minutes.on)} min, outside 22 to 30`]
}

function decisionProblems(
  { planet, localItemId }: IdentityPlanetRow,
  on: readonly IdentityPaceRun[],
): string[] {
  if (localItemId === null) return [`planet ${planet} has no local kit item to decide on`]
  return on
    .filter((run) => !decisionOf(run.trace.planets.get(planet)).includes(localItemId))
    .map(
      (run) =>
        `merchants on: seed ${run.worldSeed} never bought ${localItemId} on planet ${planet}`,
    )
}

function distinctDecisionProblems(rows: readonly IdentityPlanetRow[]): string[] {
  const ids = rows.map((row) => row.localItemId)
  return new Set(ids).size === ids.length
    ? []
    : [`two planets share a local decision: ${ids.join(', ')}`]
}

function offCurveProblems(on: readonly IdentityPaceRun[]): string[] {
  const items = IDENTITY_PLANETS.map(localItemIdOf).filter((id): id is string => id !== null)
  return [
    ...items.flatMap((itemId) => offCurveLineProblems(on, itemId)),
    ...offCurveCombinedProblems(on),
  ]
}

function offCurveLineProblems(on: readonly IdentityPaceRun[], itemId: string): string[] {
  const share = medianOf(on.map((run) => offCurveShareBpOf(run, itemId)))
  if (share === null || share <= IDENTITY_PACE_BARS.offCurveLineBpMax) return []
  return [`merchants on: ${itemId} is ${share} bp of the money spent, bar 600`]
}

function offCurveCombinedProblems(on: readonly IdentityPaceRun[]): string[] {
  const share = medianOf(on.map((run) => offCurveShareBpOf(run)))
  if (share === null || share <= IDENTITY_PACE_BARS.offCurveCombinedBpMax) return []
  return [`merchants on: the kit items are ${share} bp of the money spent, bar 1200`]
}

/** The planet's premium ore on the first trip after the jump in (HS: reachable on it). */
function signatureProblems(
  { planet }: IdentityPlanetRow,
  on: readonly IdentityPaceRun[],
): string[] {
  if (planet < IDENTITY_PACE_BARS.firstJumpPlanet) return []
  const units = medianOf(on.map((run) => firstTripUnitsOf(run.trace.planets.get(planet))))
  if (units !== null && units > 0) return []
  return [
    `merchants on: planet ${planet}'s premium ore not mined on the first trip (median ${units ?? 'never'})`,
  ]
}

function isInMinutesBand(minutes: number | null): boolean {
  const { min, max } = IDENTITY_PACE_BARS.planetMinutes
  return minutes !== null && minutes >= min && minutes <= max
}

function isWithinPaired({ off, on }: Paired<number | null>): boolean {
  if (off === null || on === null) return false
  return Math.abs(on - off) * BASIS_POINTS <= off * IDENTITY_PACE_BARS.pairedToleranceBp
}

function isNearEquilibrium(planet: number, step: number | null): boolean {
  if (step === null) return false
  const { min, max } = IDENTITY_PACE_BARS.moneyRateToEquilibrium
  const share = step / equilibriumOf(planet)
  return share >= min && share <= max
}

export function equilibriumOf(planet: number): number {
  return equilibriumRateStepOf(planet, IDENTITY_PACE_BARS.pStar)
}

function numberStepOf(after: number | null, before: number | null): number | null {
  if (after === null || before === null || before === 0) return null
  return after / before
}

function numberText(value: number | null): string {
  return value === null ? 'never' : value.toFixed(2)
}
