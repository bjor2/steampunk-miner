/**
 * Every drill dive lays casing (#115 acceptance 1): a dive runs from leaving the dock to the next
 * departure, and one that destroyed any tile must log at least one `casing_placed`, as a player's
 * drilling does (#41). Derived from the run's events only (#11 section 3).
 */
import type { RunEvent } from './runEvent'

interface Dive {
  /** The tick the vehicle left the dock. */
  leftTick: number
  tilesDestroyed: number
  ringsPlaced: number
}

/** The tick each drill dive left the dock that destroyed tiles but laid no casing ring. */
export function diveTicksWithoutCasing(events: readonly RunEvent[]): number[] {
  return divesOf(events)
    .filter(isDrillDiveWithoutCasing)
    .map((dive) => dive.leftTick)
}

/** How many drill dives (dives that destroyed a tile) the run holds. */
export function countDrillDives(events: readonly RunEvent[]): number {
  return divesOf(events).filter((dive) => dive.tilesDestroyed > 0).length
}

function isDrillDiveWithoutCasing(dive: Dive): boolean {
  return dive.tilesDestroyed > 0 && dive.ringsPlaced === 0
}

function divesOf(events: readonly RunEvent[]): Dive[] {
  const dives: Dive[] = []
  for (const event of events) {
    if (event.event === 'dock_left') dives.push(emptyDive(event.tick))
    else countIntoDive(dives.at(-1), event)
  }
  return dives
}

function emptyDive(leftTick: number): Dive {
  return { leftTick, tilesDestroyed: 0, ringsPlaced: 0 }
}

function countIntoDive(dive: Dive | undefined, event: RunEvent): void {
  if (dive === undefined) return
  if (event.event === 'tile_destroyed') dive.tilesDestroyed += 1
  if (event.event === 'casing_placed') dive.ringsPlaced += 1
}
