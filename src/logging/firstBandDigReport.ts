/**
 * The #81 sawtooth in a run's summary (C3 #86 acceptance 3): for each planet, the drill time per
 * metre of its first band with the track levels the vehicle arrived with and the levels it left
 * with (its `travel_started`, or the run's last levels on the planet it ended on). Derived from the
 * logged levels by the pure drill rule, never written into the log (#11 section 3). Reported, never
 * gated: #81 acceptance 1 wants departure at most 0.7x arrival on every campaign planet.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { PACING_TARGETS } from '../constants/pacingTargets'
import { UPGRADE_IDS } from '../systems/economy/economyDefinition'
import type { UpgradeLevels } from '../systems/economy/vehicleStats'
import { firstBandDigTicks } from '../systems/vehicle/firstBandDig'

/** Band-1 drill ticks per metre; null where the tip only skids on band 1. */
export interface FirstBandDig {
  arrival: number | null
  departure: number | null
}

/** Track id to level, as the summary keeps them: a track never bought is at level 0. */
export type LoggedLevels = Readonly<Record<string, number>>

export interface PlanetLevels {
  /** Planet index (as a string key) to the levels it was entered with. */
  arrival: Record<string, LoggedLevels>
  /** Planet index (as a string key) to the levels it was left with. */
  departure: Record<string, LoggedLevels>
}

export function firstBandDigOf(
  levels: PlanetLevels,
  lastLevels: LoggedLevels,
): Record<string, FirstBandDig> {
  const entries = Object.entries(levels.arrival).map(([planet, arrival]) => {
    const departure = levels.departure[planet] ?? lastLevels
    return [planet, digOnPlanet(Number.parseInt(planet), arrival, departure)] as const
  })
  return Object.fromEntries(entries)
}

function digOnPlanet(planetIndex: number, arrival: LoggedLevels, departure: LoggedLevels) {
  return {
    arrival: firstBandDigTicks(planetIndex, upgradeLevelsOf(arrival)),
    departure: firstBandDigTicks(planetIndex, upgradeLevelsOf(departure)),
  }
}

function upgradeLevelsOf(logged: LoggedLevels): UpgradeLevels {
  const entries = UPGRADE_IDS.map((upgradeId) => [upgradeId, logged[upgradeId] ?? 0] as const)
  return Object.fromEntries(entries) as UpgradeLevels
}

/** Departure over arrival; null when either side cannot dig band 1 at all. */
export function firstBandDigRatio(dig: FirstBandDig): number | null {
  if (dig.arrival === null || dig.departure === null) return null
  return dig.departure / dig.arrival
}

/** #81 acceptance 1: the planets whose band 1 did not get at least 30% faster during the stay. */
export function firstBandDigAlerts(digs: Readonly<Record<string, FirstBandDig>>): string[] {
  const most = PACING_TARGETS.firstBandDigDepartureRatioMax
  return Object.entries(digs)
    .filter(([, dig]) => !isSawtoothMet(dig, most))
    .map(
      ([planet, dig]) =>
        `planet ${planet} band 1 dug ${digText(dig.arrival)} on arrival and ${digText(dig.departure)} at departure, target at most ${most}x`,
    )
}

/** An arrival the tip only skidded on has nothing to beat; a departure that skids never passes. */
function isSawtoothMet(dig: FirstBandDig, most: number): boolean {
  if (dig.departure === null) return false
  return dig.arrival === null || dig.departure <= dig.arrival * most
}

/** Display only: seconds per metre to two places, or `no dig` where the tip skids. */
export function digText(ticks: number | null): string {
  return ticks === null ? 'no dig' : `${(ticks / TICKS_PER_SECOND).toFixed(2)} s/m`
}

/** One Markdown row per planet: arrival, departure and their ratio. */
export function formatFirstBandDigTable(digs: Readonly<Record<string, FirstBandDig>>): string {
  const rows = Object.entries(digs).map(
    ([planet, dig]) =>
      `| ${planet} | ${digText(dig.arrival)} | ${digText(dig.departure)} | ${ratioText(dig)} |`,
  )
  return [
    '| planet | band 1 on arrival | band 1 at departure | ratio |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function ratioText(dig: FirstBandDig): string {
  const ratio = firstBandDigRatio(dig)
  return ratio === null ? 'n/a' : `${ratio.toFixed(2)}x`
}
