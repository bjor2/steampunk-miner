/**
 * One summary per dive, derived from a run's events only (#107 "each dive summary records the
 * energy spent on guns"; #11: derived data stays derived). A dive starts at `dock_left` and ends
 * at the next `dock_entered`. The guns log their hits per pose report, and the last ones of a
 * trip when it ends, which is just after the dock or the tow, so a `gun_hit` counts for the dive
 * that is open or, between dives, for the dive that just ended. A run that starts out on a trip
 * (a scenario) opens its first dive at its first gun line.
 */
import type { RunEventName } from './eventNames'
import type { RunEvent } from './runEvent'

export interface DiveSummary {
  /** The planet the dive started on. */
  planet: number
  /** The tick of its `dock_left`, or null when the run started out on this dive. */
  leftTick: number | null
  /** The tick of the `dock_entered` that ended it, or null while it is still out. */
  dockedTick: number | null
  gunShots: number
  /** Boiler energy the guns spent, in 1/240-unit quanta. */
  gunEnergy: number
  gunKills: number
}

interface DiveTally {
  dives: DiveSummary[]
  isOut: boolean
}

export function deriveDiveSummaries(events: readonly RunEvent[]): DiveSummary[] {
  const tally: DiveTally = { dives: [], isOut: false }
  for (const event of events) foldDiveEvent(tally, event)
  return tally.dives
}

type DiveFold<N extends RunEventName> = (tally: DiveTally, event: RunEvent<N>) => void

const DIVE_FOLDS: { readonly [N in RunEventName]?: DiveFold<N> } = {
  dock_left: (tally, event) => startDive(tally, event, event.tick),
  dock_entered: (tally, { tick }) => endDive(tally, tick),
  gun_hit: addGunHit,
  enemy_killed: addKill,
}

function foldDiveEvent(tally: DiveTally, event: RunEvent): void {
  DIVE_FOLDS[event.event]?.(tally, event as never)
}

function startDive(tally: DiveTally, event: RunEvent, leftTick: number | null): void {
  tally.dives.push({
    planet: event.planet,
    leftTick,
    dockedTick: null,
    gunShots: 0,
    gunEnergy: 0,
    gunKills: 0,
  })
  tally.isOut = true
}

function endDive(tally: DiveTally, tick: number): void {
  const dive = tally.dives.at(-1)
  if (tally.isOut && dive !== undefined) dive.dockedTick = tick
  tally.isOut = false
}

function addGunHit(tally: DiveTally, event: RunEvent<'gun_hit'>): void {
  const dive = currentDiveOf(tally, event)
  dive.gunShots += event.data.shots
  dive.gunEnergy += event.data.energy
}

function addKill(tally: DiveTally, event: RunEvent<'enemy_killed'>): void {
  if (event.data.by === 'gun') currentDiveOf(tally, event).gunKills += 1
}

function currentDiveOf(tally: DiveTally, event: RunEvent): DiveSummary {
  if (tally.dives.length === 0) startDive(tally, event, null)
  return tally.dives[tally.dives.length - 1]
}
