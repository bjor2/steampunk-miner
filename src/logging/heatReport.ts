/**
 * What heat and lava did to a run on the heat planets (spec #113 numbers acceptance 4), derived
 * from its events only, planet by planet: when the act's lining type was unlocked (minutes after
 * arriving), how much refractory lining was laid, the throttle and heat-damage episodes, the lava
 * touches and the lava a refractory ring stopped. Beside each, the core time against the campaign's
 * 45 to 60 minutes (C4). Reported, never gated: a miss is a balance finding whose one lever is the
 * `bandHeat` scale, 0.8 to 1.2 times (#113), never `k_casing`.
 */
import { PACING_TARGETS } from '../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { PacingReport } from './pacingReport'
import type { RunEvent } from './runEvent'

export interface HeatPlanetLine {
  planet: number
  coreMinutes: number | null
  isInCampaignTarget: boolean | null
  /** Minutes from arriving to unlocking refractory, or null if the run never did here. */
  refractoryUnlockedMinutes: number | null
  refractoryMetres: number
  overheats: number
  heatDamageHits: number
  lavaTouches: number
  lavaBlocked: number
}

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const MM_PER_METRE = 1000

export function heatPlanetLines(
  events: readonly RunEvent[],
  pacing: PacingReport,
  planets: readonly number[],
): HeatPlanetLine[] {
  return planets.map((planet) => heatPlanetLineOf(events, pacing, planet))
}

function heatPlanetLineOf(
  events: readonly RunEvent[],
  pacing: PacingReport,
  planet: number,
): HeatPlanetLine {
  const here = events.filter((event) => event.planet === planet)
  const coreTicks = pacing.coreTicksOnPlanet[String(planet)]
  const coreMinutes = coreTicks === undefined ? null : coreTicks / TICKS_PER_MINUTE
  return {
    planet,
    coreMinutes,
    isInCampaignTarget: coreMinutes === null ? null : isInTarget(coreMinutes),
    refractoryUnlockedMinutes: refractoryUnlockedMinutesOf(here),
    refractoryMetres: refractoryMetresOf(here),
    overheats: countOf(here, (event) => event.event === 'overheat_started'),
    heatDamageHits: countOf(here, isHeatDamage),
    lavaTouches: countOf(here, (event) => event.event === 'lava_contact'),
    lavaBlocked: countOf(here, (event) => event.event === 'lava_blocked'),
  }
}

/** A markdown table of the lines, for the balance report. */
export function formatHeatPlanetLines(lines: readonly HeatPlanetLine[]): string {
  const rows = lines.map(
    (line) =>
      `| ${line.planet} | ${minutesText(line.coreMinutes)} | ${verdictText(line.isInCampaignTarget)} | ${minutesText(line.refractoryUnlockedMinutes)} | ${line.refractoryMetres} | ${line.overheats} | ${line.heatDamageHits} | ${line.lavaTouches} | ${line.lavaBlocked} |`,
  )
  return [
    '| planet | core | C4 45-60 | refractory unlocked | refractory laid (m) | overheats | heat damage hits | lava touches | lava blocked |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function refractoryUnlockedMinutesOf(here: readonly RunEvent[]): number | null {
  const arrival = here.find((event) => event.event === 'planet_entered')?.tick ?? here[0]?.tick
  const unlock = here.find((event) => event.event === 'lining_type_unlocked')
  if (unlock === undefined || arrival === undefined) return null
  return (unlock.tick - arrival) / TICKS_PER_MINUTE
}

function refractoryMetresOf(here: readonly RunEvent[]): number {
  const millimetres = here
    .filter((event) => event.event === 'casing_lined')
    .map((event) => (event as RunEvent<'casing_lined'>).data)
    .filter((data) => data.type === 'refractory')
    .reduce((total, data) => total + data.lengthMm, 0)
  return millimetres / MM_PER_METRE
}

function isHeatDamage(event: RunEvent): boolean {
  return (
    event.event === 'vehicle_damaged' &&
    (event as RunEvent<'vehicle_damaged'>).data.source === 'heat'
  )
}

function isInTarget(minutes: number): boolean {
  const { min, max } = PACING_TARGETS.campaignPlanetMinutes
  return minutes >= min && minutes <= max
}

function countOf(events: readonly RunEvent[], isCounted: (event: RunEvent) => boolean): number {
  return events.filter(isCounted).length
}

function minutesText(minutes: number | null): string {
  return minutes === null ? '-' : `${minutes.toFixed(1)} min`
}

function verdictText(isInTargetNow: boolean | null): string {
  if (isInTargetNow === null) return 'not reached'
  return isInTargetNow ? 'in' : 'outside'
}
