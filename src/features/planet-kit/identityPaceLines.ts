/**
 * What the PK7 identity gate prints and logs (ticket 826; the GD lock of 24 Oct on per-planet
 * identity P1-P5): one trace row per planet with its time both ways, the decision merchants on
 * made there, the off-curve spend share and the merchant's income share; then each seed's
 * decisions. The same numbers go to `balance-report/planet-identity.ndjson`, one row per seed,
 * hand and planet, so the per-planet trace is logged beside the run.
 *
 * The Damp Flask's gas income is logged per planet as the bar asks (Systems on the locked kits: at
 * most 5% of the planet's income). The flask #881 and #882 built clears firedamp and bottles
 * nothing to sell, so the row reads 0 on every planet; a gas sale, once one exists, joins here.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { toFixedText, ZERO_MONEY, type Money } from '../../systems/money'
import { decisionOf, kitSpentOf, type PlanetIdentity } from './identityTrace'
import {
  IDENTITY_PLANETS,
  identityPlanetRowsOf,
  medianOf,
  minutesText,
  seedMinutesOf,
  shareBpOf,
  type IdentityPlanetRow,
} from './identityPaceRows'
import type { IdentityPaceRun } from './identityPaceRuns'

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
/** No gas is sold yet: see the header. */
const FLASK_GAS_SALES: Money = ZERO_MONEY

/** One planet of one seed's run under one hand, as logged. */
export interface IdentityTraceRow {
  seed: number
  hand: string
  planet: number
  minutes: number | null
  decision: string[]
  kitSpent: string
  spent: string
  fuelShareBp: number | null
  offCurveShareBp: number | null
  merchantIncomeShareBp: number | null
  flaskGasSales: string
  cratesDropped: number
  flasksUncorked: number
  firstTripPremiumUnits: string
}

/** The trace table, one row per planet, then each seed's decisions under merchants on. */
export function identityPaceLinesOf(
  off: readonly IdentityPaceRun[],
  on: readonly IdentityPaceRun[],
): string[] {
  return [
    '| planet | min off | min on | felt off | felt on | drill+tip off | decision on | off-curve on | merchant income on | flask gas |',
    '| ------ | ------- | ------ | -------- | -------- | ------------- | ----------- | ------------ | ------------------ | --------- |',
    ...identityPlanetRowsOf(off, on).map((row) => planetLineOf(row, on)),
    ...on.map(seedDecisionLineOf),
  ]
}

/** Every seed, hand and planet as one logged row. */
export function identityTraceRowsOf(runs: readonly IdentityPaceRun[]): IdentityTraceRow[] {
  return runs.flatMap((run) => IDENTITY_PLANETS.map((planet) => traceRowOf(run, planet)))
}

function planetLineOf(row: IdentityPlanetRow, on: readonly IdentityPaceRun[]): string {
  const planets = on.map((run) => run.trace.planets.get(row.planet))
  const cells = [
    row.planet,
    minutesText(row.minutes.off),
    minutesText(row.minutes.on),
    numberText(row.felt.off),
    numberText(row.felt.on),
    row.drillTipMajors.off ?? '-',
    decisionText(planets),
    bpText(medianOf(planets.map(offCurveShareOfPlanet))),
    bpText(medianOf(planets.map(merchantIncomeShareOf))),
    bpText(medianOf(planets.map(flaskGasShareOf))),
  ]
  return `| ${cells.join(' | ')} |`
}

function traceRowOf(run: IdentityPaceRun, planet: number): IdentityTraceRow {
  const identity = run.trace.planets.get(planet)
  return {
    seed: run.worldSeed,
    hand: run.hand,
    planet,
    minutes: seedMinutesOf([run], planet)[0],
    decision: decisionOf(identity),
    kitSpent: moneyText(identity === undefined ? ZERO_MONEY : kitSpentOf(identity)),
    spent: moneyText(identity?.spent ?? ZERO_MONEY),
    fuelShareBp: fuelShareOf(identity),
    offCurveShareBp: offCurveShareOfPlanet(identity),
    merchantIncomeShareBp: merchantIncomeShareOf(identity),
    flaskGasSales: moneyText(FLASK_GAS_SALES),
    cratesDropped: identity?.cratesDropped ?? 0,
    flasksUncorked: identity?.flasksUncorked ?? 0,
    firstTripPremiumUnits: (identity?.firstTripPremiumUnits ?? 0n).toString(),
  }
}

function seedDecisionLineOf(run: IdentityPaceRun): string {
  const planets = IDENTITY_PLANETS.map((planet) => {
    const identity = run.trace.planets.get(planet)
    return `P${planet} ${decisionOf(identity).join('+') || 'nothing'}${useText(identity)}`
  })
  return `seed ${run.worldSeed} merchants on: ${planets.join('; ')}`
}

/** What the planet's kit did: crates dropped, flasks uncorked, minutes each tool acted. */
function useText(identity: PlanetIdentity | undefined): string {
  if (identity === undefined) return ''
  const acting = [...identity.actingTicks.entries()].map(
    ([toolId, ticks]) => `${toolId} ${(ticks / TICKS_PER_MINUTE).toFixed(1)} min`,
  )
  const uses = [
    ...(identity.cratesDropped > 0 ? [`${identity.cratesDropped} dropped`] : []),
    ...(identity.flasksUncorked > 0 ? [`${identity.flasksUncorked} uncorked`] : []),
    ...acting,
  ]
  return uses.length === 0 ? '' : ` (${uses.join(', ')})`
}

/** The ids bought on the planet over the seeds, each with the seeds that bought it. */
function decisionText(planets: readonly (PlanetIdentity | undefined)[]): string {
  const ids = [...new Set(planets.flatMap(decisionOf))].sort()
  if (ids.length === 0) return 'nothing'
  return ids
    .map(
      (id) => `${id} ${planets.filter((p) => decisionOf(p).includes(id)).length}/${planets.length}`,
    )
    .join(', ')
}

function offCurveShareOfPlanet(identity: PlanetIdentity | undefined): number | null {
  return identity === undefined ? null : shareBpOf(kitSpentOf(identity), identity.spent)
}

function merchantIncomeShareOf(identity: PlanetIdentity | undefined): number | null {
  return identity === undefined ? null : shareBpOf(identity.premiumIncome, identity.sales)
}

function fuelShareOf(identity: PlanetIdentity | undefined): number | null {
  return identity === undefined ? null : shareBpOf(identity.fuelSpent, identity.spent)
}

function flaskGasShareOf(identity: PlanetIdentity | undefined): number | null {
  return identity === undefined ? null : shareBpOf(FLASK_GAS_SALES, identity.sales)
}

function bpText(bp: number | null): string {
  return bp === null ? '-' : `${(bp / 100).toFixed(1)}%`
}

function numberText(value: number | null): string {
  return value === null ? 'never' : value.toFixed(2)
}

function moneyText(money: Money): string {
  return toFixedText(money, 1)
}
