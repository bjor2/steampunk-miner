/**
 * The aggregated `drill_cut` line (ticket 335, TD scope b on #316): a `drillStep` cuts a tick at a
 * time and may break many cells in it, so its per-cell `TileDestroyed` and `CargoAdded` (which stay
 * per cell as domain events) project to one line for the step, at the place of its first one:
 * the cells broken, the units that reached the hold and their value. The run log then grows with
 * ticks and players, not with cells. Every other command's events project one by one as before.
 */
import { add, fromCanonical, toCanonical, ZERO_MONEY } from '../systems/money'
import { isCommandCaused, type DomainEvent } from '../systems/authority/domainEvent'
import type { RunEventData } from './eventNames'

/** Whether the command that caused an event is a drill step (`RunLog.commandTypeOf`). */
export type IsDrillStepEvent = (event: DomainEvent) => boolean

/** An event folded into its step's `drill_cut` line: a drilled cell or the unit it gave. */
export function isFoldedIntoDrillCut(event: DomainEvent, isDrillStep: IsDrillStepEvent): boolean {
  const isPerCell =
    (event.type === 'TileDestroyed' && event.cause === undefined) || event.type === 'CargoAdded'
  return isPerCell && isDrillStep(event)
}

/** The step a folded event belongs to: its player and command seq. */
export function drillStepKeyOf(event: DomainEvent): string {
  return isCommandCaused(event) ? `${event.playerId}:${event.seq}` : ''
}

/** Each drill step's folded events in the batch, keyed by `drillStepKeyOf`, in order. */
export function drillStepEventsOf(
  events: readonly DomainEvent[],
  isDrillStep: IsDrillStepEvent,
): Map<string, DomainEvent[]> {
  const steps = new Map<string, DomainEvent[]>()
  for (const event of events.filter((each) => isFoldedIntoDrillCut(each, isDrillStep))) {
    const key = drillStepKeyOf(event)
    const stepEvents = steps.get(key)
    if (stepEvents === undefined) steps.set(key, [event])
    else stepEvents.push(event)
  }
  return steps
}

/** The `drill_cut` data of one step's folded events. */
export function drillCutDataOf(events: readonly DomainEvent[]): RunEventData<'drill_cut'> {
  let cells = 0
  let units = 0
  let value = ZERO_MONEY
  for (const event of events) {
    if (event.type === 'TileDestroyed') cells += 1
    if (event.type !== 'CargoAdded') continue
    units += event.amount
    value = add(value, fromCanonical(event.value))
  }
  return { cells, units, value: toCanonical(value) }
}
