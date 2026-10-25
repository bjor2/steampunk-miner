/**
 * `docs/economy/pace-baseline.md` as the PK7 trace writes it (ticket 826; Systems' rewrite of the
 * baseline, GD-approved 25 Oct): per-seed and median minutes for P1-P5 both ways, then each
 * planet's drill + tip buys, fuel share and money per minute, and what merchants on decided. The
 * lane `identityPace.lane.test.ts` writes it to `balance-report/pace-baseline.md`; the measured
 * file replaces the committed one.
 */
import { toFixedText, type Money } from '../../systems/money'
import { equilibriumOf, IDENTITY_PACE_BARS } from './identityPaceBars'
import { identityTraceRowsOf, type IdentityTraceRow } from './identityPaceLines'
import {
  IDENTITY_PLANETS,
  identityPlanetRowsOf,
  medianOf,
  minutesText,
  seedMinutesOf,
  type IdentityPlanetRow,
} from './identityPaceRows'
import type { IdentityPaceRun, MerchantHand } from './identityPaceRuns'

const PLANET_HEADS = IDENTITY_PLANETS.map((planet) => `P${planet}`)

/** The whole document, measured on `measuredOn` (a date and commit the lane names). */
export function paceBaselineMarkdownOf(
  off: readonly IdentityPaceRun[],
  on: readonly IdentityPaceRun[],
  measuredOn: string,
): string {
  const rows = identityPlanetRowsOf(off, on)
  return [
    ...introLines(measuredOn),
    ...minutesSection('Skip all merchants (the bare bot)', off),
    ...minutesSection('Merchants on (each planet its own kit)', on),
    ...planetSection(rows, [...identityTraceRowsOf(off), ...identityTraceRowsOf(on)]),
    ...barLines(),
  ].join('\n')
}

function introLines(measuredOn: string): string[] {
  return [
    '# Pace baseline, planets 1 to 5, the PK7 identity trace (ticket 826)',
    '',
    'Written by `npx vitest run src/features/planet-kit/identityPace.lane.test.ts`, which plays the',
    'bot scenario to planet 5 on the three pacing seeds twice: skipping every merchant (the bare',
    'bot) and with merchants on (the Cache Crate on P1, then each planet buys its local tool or',
    'consumable). Minutes run from arrival to the core, after the vehicle-width cut (#662).',
    `Measured on ${measuredOn}. It replaces the 40-56 min medians of #146.`,
    '',
  ]
}

function minutesSection(title: string, runs: readonly IdentityPaceRun[]): string[] {
  const seedRows = runs.map((run) => [
    String(run.worldSeed),
    ...IDENTITY_PLANETS.map((planet) => minutesText(seedMinutesOf([run], planet)[0])),
  ])
  const median = [
    '**median**',
    ...IDENTITY_PLANETS.map(
      (planet) => `**${minutesText(medianOf(seedMinutesOf(runs, planet)))}**`,
    ),
  ]
  return [`## ${title}`, '', ...tableLines(['seed', ...PLANET_HEADS], [...seedRows, median]), '']
}

function planetSection(
  rows: readonly IdentityPlanetRow[],
  traceRows: readonly IdentityTraceRow[],
): string[] {
  const head = [
    'planet',
    'drill + tip off',
    'drill + tip on',
    'fuel share off',
    'money/min off',
    'money/min on',
    '#551 step',
    'decision on',
    'off-curve on',
    'merchant income on',
  ]
  return [
    '## Per planet (medians)',
    '',
    ...tableLines(
      head,
      rows.map((row) => planetCells(row, traceRows)),
    ),
    '',
  ]
}

function planetCells(row: IdentityPlanetRow, traceRows: readonly IdentityTraceRow[]): string[] {
  const of = (hand: MerchantHand) =>
    traceRows.filter((trace) => trace.hand === hand && trace.planet === row.planet)
  return [
    `P${row.planet}`,
    countText(row.drillTipMajors.off),
    countText(row.drillTipMajors.on),
    bpText(medianOf(of('off').map((trace) => trace.fuelShareBp))),
    rateText(row.moneyPerMinute.off),
    rateText(row.moneyPerMinute.on),
    row.planet === 1 ? '-' : `x${equilibriumOf(row.planet).toFixed(2)}`,
    row.localItemId ?? '-',
    bpText(medianOf(of('on').map((trace) => trace.offCurveShareBp))),
    bpText(medianOf(of('on').map((trace) => trace.merchantIncomeShareBp))),
  ]
}

function barLines(): string[] {
  const { planetMinutes, offCurveLineBpMax, offCurveCombinedBpMax } = IDENTITY_PACE_BARS
  return [
    '## Bars (`identityPaceBars.ts`)',
    '',
    `- Skip all merchants: ${planetMinutes.min}-${planetMinutes.max} min a planet, drill + tip`,
    '  3.5-7 and felt speed at least 0.9x the planet before on P2-P5, money per minute within 5%',
    '  of the #551 step, nothing bought at a merchant.',
    '- Merchants on: minutes and felt speed within 5% of skip-all on each planet, a different',
    '  local decision on each planet on every seed, the premium ore mined on the first trip.',
    `- Off-curve spend at most ${offCurveLineBpMax / 100}% per item and`,
    `  ${offCurveCombinedBpMax / 100}% combined of the money the run spent.`,
    '- The Damp Flask sells no gas yet, so its income is 0 on every planet (bar: 5%).',
    '- The ore-premium backtrack bar holds at g 2 to 10 off the curve',
    '  (`systems/premiumBacktrack.ts`).',
    '',
  ]
}

function tableLines(head: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
  ]
}

function countText(value: number | null): string {
  return value === null ? 'never' : String(value)
}

function rateText(rate: Money | null): string {
  return rate === null ? 'never' : toFixedText(rate, 1)
}

function bpText(bp: number | null): string {
  return bp === null ? '-' : `${(bp / 100).toFixed(1)}%`
}
