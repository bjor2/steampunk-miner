/**
 * The tunnel wrecker's pacing report (spec #111, Systems & Economy acceptance 3), derived from run
 * events only: per dive (from leaving a dock to the next dock or tow) the rings wreckers breached
 * (`ring_gnawed`) and the collapses that started after the dive's deepest point, on the way home.
 * Over the dives on planets 6 to 9 it reports the median rings breached and how many dives set off
 * a collapse on the way home, against the target; it never fails a build.
 */
import { PACING_TARGETS } from '../constants/pacingTargets'
import type { RunEventName } from './eventNames'
import type { RunEvent } from './runEvent'

export interface WreckerDive {
  planet: number
  ringsBreached: number
  collapsesOnWayHome: number
}

interface OpenDive extends WreckerDive {
  deepestTiles: number
}

const DIVE_ENDS: readonly RunEventName[] = ['dock_entered', 'rescue_triggered']

export function deriveWreckerDives(events: readonly RunEvent[]): WreckerDive[] {
  const dives: WreckerDive[] = []
  let open: OpenDive | null = null
  for (const event of events) {
    if (event.event === 'dock_left') open = newDive(event.planet)
    else if (open !== null && DIVE_ENDS.includes(event.event)) open = closeDive(dives, open)
    else if (open !== null) foldIntoDive(open, event)
  }
  return dives
}

/** The report's lines: what was measured on planets 6 to 9, then each target it misses. */
export function wreckerDiveLines(dives: readonly WreckerDive[]): string[] {
  const measured = dives.filter(isOnWreckerPlanet)
  if (measured.length === 0)
    return [`tunnel wrecker: no dive on planets ${planetsText()} to measure`]
  return [summaryLine(measured), ...wreckerDiveAlerts(measured)]
}

/** The #111 targets the dives on planets 6 to 9 miss; reported, never failed. */
export function wreckerDiveAlerts(dives: readonly WreckerDive[]): string[] {
  return [...ringsBreachedAlerts(dives), ...collapseOnWayHomeAlerts(dives)]
}

export function medianRingsBreached(dives: readonly WreckerDive[]): number {
  const sorted = dives.map(({ ringsBreached }) => ringsBreached).sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function newDive(planet: number): OpenDive {
  return { planet, ringsBreached: 0, collapsesOnWayHome: 0, deepestTiles: 0 }
}

function closeDive(dives: WreckerDive[], open: OpenDive): null {
  const { planet, ringsBreached, collapsesOnWayHome } = open
  dives.push({ planet, ringsBreached, collapsesOnWayHome })
  return null
}

/** A new deepest point starts the way home again: only collapses after it count. */
function foldIntoDive(open: OpenDive, event: RunEvent): void {
  if (event.depthTiles > open.deepestTiles) {
    open.deepestTiles = event.depthTiles
    open.collapsesOnWayHome = 0
  }
  if (event.event === 'ring_gnawed') open.ringsBreached += 1
  if (event.event === 'collapse') open.collapsesOnWayHome += 1
}

function ringsBreachedAlerts(dives: readonly WreckerDive[]): string[] {
  const { min, max } = PACING_TARGETS.wreckerRingsBreachedPerDive
  const median = medianRingsBreached(dives)
  if (median >= min && median <= max) return []
  return [`median dive had ${median} rings breached, target ${min} to ${max}`]
}

function collapseOnWayHomeAlerts(dives: readonly WreckerDive[]): string[] {
  const perHundred = PACING_TARGETS.wreckerCollapseDivesPerHundred
  const collapsing = collapsingDives(dives)
  if (collapsing * 100 <= perHundred * dives.length) return []
  return [
    `${collapsing} of ${dives.length} dives set off a collapse on the way home, ` +
      `target at most ${perHundred} in 100`,
  ]
}

function collapsingDives(dives: readonly WreckerDive[]): number {
  return dives.filter(({ collapsesOnWayHome }) => collapsesOnWayHome > 0).length
}

function isOnWreckerPlanet(dive: WreckerDive): boolean {
  const { first, last } = PACING_TARGETS.wreckerPlanets
  return dive.planet >= first && dive.planet <= last
}

function summaryLine(dives: readonly WreckerDive[]): string {
  return (
    `tunnel wrecker, planets ${planetsText()}: ${dives.length} dives, median ` +
    `${medianRingsBreached(dives)} rings breached, ${collapsingDives(dives)} set off a collapse ` +
    'on the way home'
  )
}

function planetsText(): string {
  const { first, last } = PACING_TARGETS.wreckerPlanets
  return `${first} to ${last}`
}
