/**
 * Recording the authority's domain events into a run log (decision #11), a batch at a time as the
 * authority answers: every event is written as its projected line (`domainEventProjection.ts`),
 * except a drill command's per-cell events, which fold into its player's drill span
 * (`drillSpanWriter.ts`, ticket 420); a carry stop or another command's event closes the span
 * before its own line.
 */
import { vehicleOf, type AuthorityState } from '../systems/authority/authorityState'
import { isCommandCaused, type DomainEvent } from '../systems/authority/domainEvent'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { bandOfTile } from '../systems/world/planetGeometry'
import type { PlanetParams } from '../systems/world/planetParams'
import { causeOf, projectDomainEvent, type ProjectedLine } from './domainEventProjection'
import {
  isSpanEventType,
  type DrillSpanStop,
  type SpanEvent,
  type SpanReading,
} from './drillCutLine'
import type { DrillSpanWriter } from './drillSpanWriter'
import type { RunEventName } from './eventNames'
import type { RunEventPlace, RunEventStamp } from './runEvent'
import { getRunLog, type RunLog } from './runLog'

const DRILL_COMMAND_TYPES: ReadonlySet<string> = new Set(['drillTile', 'drillStep', 'reportPose'])

/**
 * The carry stops of #399 that close a drill span (ticket 420): the gate, the core, lava or an
 * electrified cell, a full hold, an empty tank. Their own line follows the span's.
 */
const CARRY_STOPS: { readonly [K in DomainEvent['type']]?: DrillSpanStop } = {
  DrillGated: 'gate',
  CoreReached: 'core',
  CoreTileHarvested: 'core',
  LavaTouched: 'hazard',
  LavaBlocked: 'hazard',
  ElectrifiedCellShocked: 'hazard',
  StorageFull: 'hold_full',
  EnergyDepleted: 'tank_empty',
}

/** What a batch's lines are stamped with, and what its drill span reads. */
interface Batch {
  place: RunEventPlace
  params: PlanetParams | null
  reading: SpanReading | null
}

export function recordDomainEvents(
  place: RunEventPlace,
  events: readonly DomainEvent[],
  state?: AuthorityState,
): void {
  recordDomainEventsTo(getRunLog(), place, events, state)
}

/**
 * The same projection into a run log the caller holds (a headless bot run has its own). A drill
 * command's per-cell events fold into its player's drill span (`drillSpanWriter.ts`, ticket 420);
 * `state`, the authority after the batch, gives the span its band and its energy and heat reading.
 */
export function recordDomainEventsTo(
  runLog: RunLog,
  place: RunEventPlace,
  events: readonly DomainEvent[],
  state?: AuthorityState,
): void {
  const batch = batchOf(place, state)
  for (const event of events) recordDomainEvent(runLog, batch, event)
  runLog.drillSpans.noteReading(place.playerId, batch.reading)
}

function batchOf(place: RunEventPlace, state: AuthorityState | undefined): Batch {
  if (state === undefined) return { place, params: null, reading: null }
  return { place, params: planetParamsOf(state.planet), reading: readingOf(state, place.playerId) }
}

function readingOf(state: AuthorityState, playerId: string): SpanReading | null {
  if (!Object.hasOwn(state.players, playerId)) return null
  const { energy, heat } = vehicleOf(state, playerId)
  return { energy, heat: heat.level }
}

function recordDomainEvent(runLog: RunLog, batch: Batch, event: DomainEvent): void {
  if (isFoldedIntoSpan(runLog, event)) {
    runLog.drillSpans.fold(spanEventOf(batch, event), batch.reading)
    return
  }
  closeSpansBefore(runLog, event)
  recordProjectedLine(runLog, batch.place, projectDomainEvent(event))
}

/** A dig, break, unit or ring a drill command caused, while the run log folds spans. */
function isFoldedIntoSpan(runLog: RunLog, event: DomainEvent): event is SpanEvent['event'] {
  return runLog.drillLines === 'spans' && isSpanEventType(event) && isDrillCaused(runLog, event)
}

function isDrillCaused(runLog: RunLog, event: DomainEvent): boolean {
  if (!isCommandCaused(event)) return false
  return DRILL_COMMAND_TYPES.has(runLog.commandTypeOf(event.playerId, event.seq) ?? '')
}

function spanEventOf(batch: Batch, event: SpanEvent['event']): SpanEvent {
  return { event, stamp: stampOf(batch.place, event), band: bandOfBrokenCell(batch, event) }
}

function bandOfBrokenCell(batch: Batch, event: SpanEvent['event']): number | null {
  if (event.type !== 'TileDestroyed' || batch.params === null) return null
  return bandOfTile(batch.params, event.tx, event.ty)
}

/**
 * A carry stop closes its player's span (every span when it names no player); so does any other
 * command's event, and an ore unit from outside a drill command, so the mined order stays in order.
 */
function closeSpansBefore(runLog: RunLog, event: DomainEvent): void {
  const stop = spanStopOf(runLog, event)
  if (stop !== null) closeSpansOf(runLog.drillSpans, event.playerId, stop)
}

function spanStopOf(runLog: RunLog, event: DomainEvent): DrillSpanStop | null {
  return CARRY_STOPS[event.type] ?? (isOutsideDrilling(runLog, event) ? 'command' : null)
}

function closeSpansOf(spans: DrillSpanWriter, playerId: string | undefined, stop: DrillSpanStop) {
  if (playerId === undefined) spans.closeAll(stop)
  else spans.close(playerId, stop)
}

function isOutsideDrilling(runLog: RunLog, event: DomainEvent): boolean {
  return event.type === 'CargoAdded' || (isCommandCaused(event) && !isDrillCaused(runLog, event))
}

function stampOf(place: RunEventPlace, event: DomainEvent): RunEventStamp {
  const { cmd } = causeOf(event)
  return cmd === undefined ? { ...place, tick: event.tick } : { ...place, tick: event.tick, cmd }
}

function recordProjectedLine(
  runLog: RunLog,
  place: RunEventPlace,
  projected: ProjectedLine | null,
): void {
  if (projected === null) return
  const { tick, cmd, line } = projected
  const stamp: RunEventStamp = cmd === undefined ? { ...place, tick } : { ...place, tick, cmd }
  // The union pairs each name with its payload; record() checks one name at a time. A slice's
  // line names an event of the runEvents registry, which the run-log schema checks.
  runLog.record(stamp, line.event as RunEventName, line.data as never)
}
