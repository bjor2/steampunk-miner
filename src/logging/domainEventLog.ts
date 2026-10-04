/**
 * Run-log lines projected from the authority's domain events (decision #11: log events are a
 * projection of domain events, never written ad hoc from game code). Events with no log line yet
 * are skipped; each later ticket adds the projection of the events it introduces.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import type { RunEventContext } from './runEvent'
import { getRunLog } from './runLog'

export function recordDomainEvents(context: RunEventContext, events: readonly DomainEvent[]) {
  for (const event of events) recordDomainEvent(context, event)
}

function recordDomainEvent(context: RunEventContext, event: DomainEvent): void {
  if (event.type !== 'DebugCommandApplied') return
  getRunLog().record(context, 'debug_command_applied', { command: event.command, args: event.args })
}
