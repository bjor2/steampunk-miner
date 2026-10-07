/**
 * The pacing report of a bot run (#29 Systems & Economy note 4, Gameplay note 3), derived from its
 * run events only: first sale and first upgrade, the ten-minute beats of #16, the time to each
 * planet's core and to the end of the slice, trips per planet, the final level of every track,
 * the rescues per cause and the hold-to-buy chains the bot bought (ticket 226). `pacingProblems` lists the targets it misses (the CI gate);
 * `pacingAlerts` lists what is reported but never fails a build.
 */
import { SLICE_LAST_PLANET } from '../constants/balance'
import { PACING_TARGETS } from '../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../constants/physics'
import { UPGRADE_IDS } from '../systems/economy/economyDefinition'
import { bandOfTile } from '../systems/world/planetGeometry'
import { planetParamsFor } from '../systems/world/planetParams'
import type { RunEventName } from './eventNames'
import { derivePurchaseChains, type PurchaseChain } from './purchaseChains'
import type { RunEvent } from './runEvent'

export interface PacingReport {
  firstSaleTick: number | null
  firstUpgradeTick: number | null
  upgradesByEarlyCheck: number
  tracksByEarlyCheck: number
  deepestBandByEarlyCheck: number
  /** Planet index to the tick its core was completed, counted from the run's start. */
  coreCompletedTick: Record<string, number>
  /** Planet index to the ticks from arriving there to completing its core. */
  coreTicksOnPlanet: Record<string, number>
  /** The tick the last planet's core was completed: the end of the slice. */
  sliceEndTick: number | null
  tripsByPlanet: Record<string, number>
  finalLevels: Record<string, number>
  rescuesByCause: Record<string, number>
  /** Hold-to-buy chains bought, and the steps bought in them (`purchaseChains.ts`). */
  purchaseChains: number
  chainedSteps: number
}

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const EARLY_CHECK_TICK = PACING_TARGETS.earlyCheckSeconds * TICKS_PER_SECOND

export function derivePacingReport(events: readonly RunEvent[], worldSeed: number): PacingReport {
  const report = emptyReport()
  const arrivals: Record<string, number> = {}
  const earlyTracks = new Set<string>()
  for (const event of events) {
    foldPacingEvent(report, event, { worldSeed, arrivals, earlyTracks })
  }
  report.tracksByEarlyCheck = earlyTracks.size
  countPurchaseChains(report, derivePurchaseChains(events))
  return report
}

interface FoldContext {
  worldSeed: number
  arrivals: Record<string, number>
  earlyTracks: Set<string>
}

function emptyReport(): PacingReport {
  return {
    firstSaleTick: null,
    firstUpgradeTick: null,
    upgradesByEarlyCheck: 0,
    tracksByEarlyCheck: 0,
    deepestBandByEarlyCheck: 0,
    coreCompletedTick: {},
    coreTicksOnPlanet: {},
    sliceEndTick: null,
    tripsByPlanet: {},
    finalLevels: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])),
    rescuesByCause: {},
    purchaseChains: 0,
    chainedSteps: 0,
  }
}

function countPurchaseChains(report: PacingReport, chains: readonly PurchaseChain[]): void {
  report.purchaseChains = chains.length
  report.chainedSteps = chains.reduce((steps, chain) => steps + chain.steps, 0)
}

function foldPacingEvent(report: PacingReport, event: RunEvent, context: FoldContext): void {
  PACING_FOLDS[event.event]?.(report, event as never, context)
}

type PacingFold<N extends RunEventName> = (
  report: PacingReport,
  event: RunEvent<N>,
  context: FoldContext,
) => void

/** One fold step per event name with something to say, as in `deriveSummary`. */
const PACING_FOLDS: { readonly [N in RunEventName]?: PacingFold<N> } = {
  planet_entered: (_report, { planet, tick }, { arrivals }) => {
    arrivals[String(planet)] ??= tick
  },
  resource_sold: (report, { tick }) => {
    report.firstSaleTick ??= tick
  },
  upgrade_purchased: (report, event, { earlyTracks }) => {
    report.firstUpgradeTick ??= event.tick
    report.finalLevels[event.data.upgradeId] = event.data.toLevel
    if (!isEarly(event)) return
    report.upgradesByEarlyCheck += 1
    earlyTracks.add(event.data.upgradeId)
  },
  tile_destroyed: (report, event, { worldSeed }) => {
    if (isEarly(event))
      report.deepestBandByEarlyCheck = Math.max(
        report.deepestBandByEarlyCheck,
        bandOfDestroyedTile(event, worldSeed),
      )
  },
  core_completed: (report, { planet, tick }, { arrivals }) => {
    const key = String(planet)
    report.coreCompletedTick[key] ??= tick
    report.coreTicksOnPlanet[key] ??= tick - (arrivals[key] ?? 0)
    report.sliceEndTick = tick
  },
  dock_left: (report, { planet }) => {
    report.tripsByPlanet[String(planet)] = (report.tripsByPlanet[String(planet)] ?? 0) + 1
  },
  rescue_triggered: (report, { data }) => {
    report.rescuesByCause[data.cause] = (report.rescuesByCause[data.cause] ?? 0) + 1
  },
}

function isEarly(event: RunEvent): boolean {
  return event.tick <= EARLY_CHECK_TICK
}

/** The band of a destroyed tile: the bot has dug there (#4 band thresholds of the planet). */
function bandOfDestroyedTile(event: RunEvent<'tile_destroyed'>, worldSeed: number): number {
  const params = planetParamsFor(worldSeed, event.planet)
  return bandOfTile(params, event.data.tx, event.data.ty)
}

/** One of the three gates the bot is held to (#29, S11 #65), and what it misses there. */
export interface PacingVerdict {
  gate: string
  problems: string[]
}

/**
 * The run against the three gates: the #16 first-ten-minutes beats, the planet 1 core window and
 * the slice window. Each passes when it lists no problem.
 */
export function pacingVerdicts(report: PacingReport): PacingVerdict[] {
  const { planet1CoreMinutes, sliceMinutes } = PACING_TARGETS
  return [
    { gate: 'first ten minutes (#16)', problems: firstTenMinutesProblems(report) },
    {
      gate: `planet 1 core, ${planet1CoreMinutes.min} to ${planet1CoreMinutes.max} min`,
      problems: minutesInRange('planet 1 core', report.coreCompletedTick['1'], planet1CoreMinutes),
    },
    {
      gate: `slice, ${sliceMinutes.min} to ${sliceMinutes.max} min`,
      problems: minutesInRange('slice', report.sliceEndTick ?? undefined, sliceMinutes),
    },
  ]
}

/** Every pacing target the run misses; an empty list passes the gate. */
export function pacingProblems(report: PacingReport): string[] {
  return pacingVerdicts(report).flatMap((verdict) => verdict.problems)
}

function firstTenMinutesProblems(report: PacingReport): string[] {
  const targets = PACING_TARGETS
  return [
    ...withinSeconds('first sale', report.firstSaleTick, targets.firstSaleSeconds),
    ...withinSeconds('first upgrade', report.firstUpgradeTick, targets.firstUpgradeSeconds),
    ...earlyBeatProblems(report),
  ]
}

/** The verdicts as a Markdown table: pass, or fail with what was missed. */
export function formatPacingVerdicts(verdicts: readonly PacingVerdict[]): string {
  const rows = verdicts.map(({ gate, problems }) => `| ${gate} | ${verdictText(problems)} |`)
  return ['| gate | result |', '| --- | --- |', ...rows].join('\n')
}

function verdictText(problems: readonly string[]): string {
  return problems.length === 0 ? 'pass' : `FAIL: ${problems.join('; ')}`
}

function withinSeconds(what: string, tick: number | null, seconds: number): string[] {
  if (tick !== null && tick <= seconds * TICKS_PER_SECOND) return []
  return [`${what} at ${secondsText(tick)}, target within ${seconds} s`]
}

function earlyBeatProblems(report: PacingReport): string[] {
  const { earlyCheckSeconds, earlyUpgrades, earlyTracks, earlyBand } = PACING_TARGETS
  const isMet =
    report.upgradesByEarlyCheck >= earlyUpgrades &&
    report.tracksByEarlyCheck >= earlyTracks &&
    report.deepestBandByEarlyCheck >= earlyBand
  if (isMet) return []
  return [
    `by ${earlyCheckSeconds} s: ${report.upgradesByEarlyCheck} upgrades on ` +
      `${report.tracksByEarlyCheck} tracks, band ${report.deepestBandByEarlyCheck}; target ` +
      `${earlyUpgrades} upgrades on ${earlyTracks} tracks and band ${earlyBand}`,
  ]
}

function minutesInRange(
  what: string,
  tick: number | undefined,
  range: { min: number; max: number },
): string[] {
  const minutes = tick === undefined ? null : tick / TICKS_PER_MINUTE
  if (minutes !== null && minutes >= range.min && minutes <= range.max) return []
  const reached = minutes === null ? 'never reached' : `at ${minutes.toFixed(1)} min`
  return [`${what} ${reached}, target ${range.min} to ${range.max} min`]
}

/** Reported, never failing (#29 note 4): a planet done in too few or too many trips. */
export function pacingAlerts(report: PacingReport): string[] {
  const { min, max } = PACING_TARGETS.tripsPerPlanet
  return Object.entries(report.tripsByPlanet)
    .filter(([, trips]) => trips < min || trips > max)
    .map(([planet, trips]) => `planet ${planet} took ${trips} trips, expected ${min} to ${max}`)
}

/** Planets after the slice (3 on): their core times are reported, never gated (#29 note 2). */
export function laterPlanetAlerts(report: PacingReport): string[] {
  const { min, max } = PACING_TARGETS.laterPlanetCoreMinutes
  return Object.entries(report.coreTicksOnPlanet)
    .filter(([planet]) => Number.parseInt(planet) > SLICE_LAST_PLANET)
    .filter(([, ticks]) => isOutsideMinutes(ticks, { min, max }))
    .map(
      ([planet, ticks]) =>
        `planet ${planet} core took ${minutesText(ticks)}, expected ${min} to ${max} min; retune paceScale(${planet})`,
    )
}

/** Every planet against the campaign's 45 to 60 minutes each (#75, #91); reported, never gated. */
export function campaignPlanetAlerts(report: PacingReport): string[] {
  const { min, max } = PACING_TARGETS.campaignPlanetMinutes
  return Object.entries(report.coreTicksOnPlanet)
    .filter(([, ticks]) => isOutsideMinutes(ticks, { min, max }))
    .map(
      ([planet, ticks]) =>
        `planet ${planet} core took ${minutesText(ticks)}, campaign target ${min} to ${max} min per planet`,
    )
}

function isOutsideMinutes(ticks: number, range: { min: number; max: number }): boolean {
  return ticks < range.min * TICKS_PER_MINUTE || ticks > range.max * TICKS_PER_MINUTE
}

function secondsText(tick: number | null): string {
  return tick === null ? 'never' : `${(tick / TICKS_PER_SECOND).toFixed(1)} s`
}

/** The report as Markdown lines, for the test output and the CI job summary. */
export function formatPacingReport(report: PacingReport): string {
  const rows = [
    ['first sale', secondsText(report.firstSaleTick)],
    ['first upgrade', secondsText(report.firstUpgradeTick)],
    ['upgrades / tracks by 600 s', `${report.upgradesByEarlyCheck} / ${report.tracksByEarlyCheck}`],
    ['deepest band by 600 s', String(report.deepestBandByEarlyCheck)],
    ...Object.entries(report.coreTicksOnPlanet).map(([planet, ticks]) => [
      `planet ${planet} core (on the planet)`,
      minutesText(ticks),
    ]),
    ['slice end', report.sliceEndTick === null ? 'never' : minutesText(report.sliceEndTick)],
    ['trips per planet', entriesText(report.tripsByPlanet)],
    ['final levels', entriesText(report.finalLevels)],
    ['rescues by cause', entriesText(report.rescuesByCause) || 'none'],
  ]
  return ['| pacing | bot |', '| --- | --- |', ...rows.map(([a, b]) => `| ${a} | ${b} |`)].join(
    '\n',
  )
}

/** Ticks as minutes to one decimal, as every pacing table prints them. */
export function minutesText(ticks: number): string {
  return `${(ticks / TICKS_PER_MINUTE).toFixed(1)} min`
}

function entriesText(record: Record<string, number>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ')
}
