/**
 * The #81 sawtooth in a run's summary (C3 #86): for each planet, the drill time per metre of one
 * band with the track levels the vehicle arrived with and the levels it left with (its
 * `travel_started`, or the run's last levels on the planet it ended on). Derived from the logged
 * levels by the pure drill rule, never written into the log (#11 section 3). The summary keeps
 * band 1 (the first probe) and band 5, the band the sawtooth is judged on (Game Director on #86):
 * departure at most 0.7x arrival, on the median of the pacing seeds (`sawtoothMedian.ts`).
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { PACING_TARGETS } from '../constants/pacingTargets'
import { UPGRADE_IDS } from '../systems/economy/economyDefinition'
import type { UpgradeLevels } from '../systems/economy/vehicleStats'
import { bandDigTicks } from '../systems/vehicle/bandDig'

/** A band's drill ticks per metre; null where the tip only skids on it. */
export interface BandDig {
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

export function bandDigOf(
  levels: PlanetLevels,
  lastLevels: LoggedLevels,
  band: number,
): Record<string, BandDig> {
  const entries = Object.entries(levels.arrival).map(([planet, arrival]) => {
    const departure = levels.departure[planet] ?? lastLevels
    return [planet, digOnPlanet(Number.parseInt(planet), band, arrival, departure)] as const
  })
  return Object.fromEntries(entries)
}

function digOnPlanet(
  planetIndex: number,
  band: number,
  arrival: LoggedLevels,
  departure: LoggedLevels,
): BandDig {
  return {
    arrival: bandDigTicks(planetIndex, upgradeLevelsOf(arrival), band),
    departure: bandDigTicks(planetIndex, upgradeLevelsOf(departure), band),
  }
}

function upgradeLevelsOf(logged: LoggedLevels): UpgradeLevels {
  const entries = UPGRADE_IDS.map((upgradeId) => [upgradeId, logged[upgradeId] ?? 0] as const)
  return Object.fromEntries(entries) as UpgradeLevels
}

/** Departure over arrival; null when either side cannot dig the band at all. */
export function bandDigRatio(dig: BandDig): number | null {
  if (dig.arrival === null || dig.departure === null) return null
  return dig.departure / dig.arrival
}

/** #81 acceptance 1: the planets whose band did not get at least 30% faster during the stay. */
export function bandDigAlerts(digs: Readonly<Record<string, BandDig>>, band: number): string[] {
  const most = PACING_TARGETS.sawtoothDepartureRatioMax
  return Object.entries(digs)
    .filter(([, dig]) => !isSawtoothMet(dig, most))
    .map(
      ([planet, dig]) =>
        `planet ${planet} band ${band} dug ${digText(dig.arrival)} on arrival and ${digText(dig.departure)} at departure, target at most ${most}x`,
    )
}

/** An arrival the tip only skidded on has nothing to beat; a departure that skids never passes. */
export function isSawtoothMet(dig: BandDig, most: number): boolean {
  if (dig.departure === null) return false
  return dig.arrival === null || dig.departure <= dig.arrival * most
}

/** Display only: seconds per metre to two places, or `no dig` where the tip skids. */
export function digText(ticks: number | null): string {
  return ticks === null ? 'no dig' : `${(ticks / TICKS_PER_SECOND).toFixed(2)} s/m`
}

/** One Markdown row per planet: arrival, departure and their ratio. */
export function formatBandDigTable(digs: Readonly<Record<string, BandDig>>, band: number): string {
  const rows = Object.entries(digs).map(
    ([planet, dig]) =>
      `| ${planet} | ${digText(dig.arrival)} | ${digText(dig.departure)} | ${ratioText(dig)} |`,
  )
  return [
    `| planet | band ${band} on arrival | band ${band} at departure | ratio |`,
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

/** Display only: the ratio to two places, or `n/a` without a dig on both sides. */
export function ratioText(dig: BandDig): string {
  const ratio = bandDigRatio(dig)
  return ratio === null ? 'n/a' : `${ratio.toFixed(2)}x`
}
