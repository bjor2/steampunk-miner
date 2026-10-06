/**
 * Slice event projections (docs/standards/feature-slices.md 3.15, K1): how the domain events a
 * slice adds to `DomainEventBodies` become run-log lines. `projectDomainEvent` uses the kernel's own
 * table for a kernel event and never reads this registry for one. Like the kernel's table, a slice
 * registers a projection for every event it adds, `() => null` for one with no log line; an event
 * with none logs nothing.
 */
import type { DomainEventBodies, DomainEventType } from '../../systems/authority/domainEvent'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'

/** A log line a slice projects: a run event name and its payload, checked by the run-log schema. */
export interface SliceRunLogLine {
  event: string
  data: Readonly<Record<string, unknown>>
}

export type SliceEventProjection<K extends DomainEventType> = (
  body: DomainEventBodies[K],
) => SliceRunLogLine | null

/** A slice's projections keyed by domain event type, the shape of the kernel's table. */
export type SliceEventProjections = {
  readonly [K in DomainEventType]?: SliceEventProjection<K>
}

/** One registered projection; the registry id is its domain event type. */
export interface EventProjectionRegistration {
  id: string
  // Method syntax on purpose: one event's projection is filed beside the others, and is only
  // called with a body of its own type.
  project(body: DomainEventBodies[DomainEventType]): SliceRunLogLine | null
}

export const EVENT_PROJECTION_REGISTRY =
  defineRegistry<EventProjectionRegistration>('eventProjections')

export function eventProjectionRegistrationsOf(
  projections: SliceEventProjections,
): readonly EventProjectionRegistration[] {
  return Object.entries(projections).map(([type, project]) => ({
    id: type,
    project: project as EventProjectionRegistration['project'],
  }))
}

/** The projection a slice registered for this domain event type; undefined when none did. */
export function sliceEventProjectionOf(
  type: string,
): EventProjectionRegistration['project'] | undefined {
  return entriesOf(EVENT_PROJECTION_REGISTRY).find((registration) => registration.id === type)
    ?.project
}
