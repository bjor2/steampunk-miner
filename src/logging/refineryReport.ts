/**
 * What the Refinery bay did in a run (#105 numbers acceptance 4 and 7), derived from its events
 * only: the realised refine gain per planet (what the collected batches paid against what their
 * ore would have sold for raw, by the planet they were collected on), and the single-lever check
 * that compares a pacing-bot run that refines with one that does not. Both are reported, never
 * gated: a finding is for the Systems & Economy Designer, whose one lever is `valueMultiplier`.
 */
import { PACING_TARGETS } from '../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../constants/physics'
import { add, fromCanonical, sub, toCanonical, ZERO_MONEY, type Money } from '../systems/money'
import type { PacingReport } from './pacingReport'
import type { RunEvent } from './runEvent'

export interface RefineGain {
  batches: number
  units: number
  rawValue: string
  value: string
  /** `value - rawValue`: what refining added over selling the same ore raw. */
  gain: string
}

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const PERCENT = 100

/** Planet index (as a string key) to the batches collected there. */
export function refineGainByPlanet(events: readonly RunEvent[]): Record<string, RefineGain> {
  const byPlanet: Record<string, { batches: number; units: number; raw: Money; value: Money }> = {}
  for (const event of events) {
    if (event.event !== 'refine_collected') continue
    const data = (event as RunEvent<'refine_collected'>).data
    const entry = (byPlanet[String(event.planet)] ??= emptyGain())
    entry.batches += 1
    entry.units += data.units
    entry.raw = add(entry.raw, fromCanonical(data.rawValue))
    entry.value = add(entry.value, fromCanonical(data.value))
  }
  return Object.fromEntries(
    Object.entries(byPlanet).map(([planet, entry]) => [planet, refineGainOf(entry)]),
  )
}

/**
 * The #105 single-lever rule, planet by planet where both runs completed the core: refining must
 * not push a planet that took at least 45 minutes below 45, nor shorten it by more than 10%.
 */
export function refineryLeverFindings(refining: PacingReport, without: PacingReport): string[] {
  return Object.entries(without.coreTicksOnPlanet).flatMap(([planet, withoutTicks]) => {
    const refiningTicks = refining.coreTicksOnPlanet[planet]
    if (refiningTicks === undefined) return []
    return planetLeverFindings(planet, refiningTicks, withoutTicks)
  })
}

/** A markdown table of the per-planet gain, for the balance reports. */
export function formatRefineGain(byPlanet: Record<string, RefineGain>): string {
  const rows = Object.entries(byPlanet).map(
    ([planet, gain]) =>
      `| ${planet} | ${gain.batches} | ${gain.units} | ${gain.rawValue} | ${gain.value} | ${gain.gain} |`,
  )
  if (rows.length === 0) return 'no batch was collected'
  return [
    '| planet | batches | units | raw | refined | gain |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function emptyGain() {
  return { batches: 0, units: 0, raw: ZERO_MONEY, value: ZERO_MONEY }
}

function refineGainOf(entry: { batches: number; units: number; raw: Money; value: Money }) {
  return {
    batches: entry.batches,
    units: entry.units,
    rawValue: toCanonical(entry.raw),
    value: toCanonical(entry.value),
    gain: toCanonical(sub(entry.value, entry.raw)),
  }
}

function planetLeverFindings(
  planet: string,
  refiningTicks: number,
  withoutTicks: number,
): string[] {
  const { min } = PACING_TARGETS.campaignPlanetMinutes
  const speedup = PACING_TARGETS.refineryMaxPlanetSpeedupPercent
  const minutes = `${minutesOf(refiningTicks)} min refining against ${minutesOf(withoutTicks)} min without`
  return [
    ...(isPushedBelowFloor(refiningTicks, withoutTicks)
      ? [`planet ${planet} drops below ${min} min: ${minutes}`]
      : []),
    ...(isShortenedTooMuch(refiningTicks, withoutTicks)
      ? [`planet ${planet} is more than ${speedup}% shorter: ${minutes}`]
      : []),
  ]
}

function isPushedBelowFloor(refiningTicks: number, withoutTicks: number): boolean {
  const floorTicks = PACING_TARGETS.campaignPlanetMinutes.min * TICKS_PER_MINUTE
  return withoutTicks >= floorTicks && refiningTicks < floorTicks
}

function isShortenedTooMuch(refiningTicks: number, withoutTicks: number): boolean {
  const kept = PERCENT - PACING_TARGETS.refineryMaxPlanetSpeedupPercent
  return refiningTicks * PERCENT < withoutTicks * kept
}

function minutesOf(ticks: number): string {
  return (ticks / TICKS_PER_MINUTE).toFixed(1)
}
