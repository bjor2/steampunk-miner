/**
 * Slice run events (docs/standards/feature-slices.md 3.15, K1): the log names and payloads a slice
 * adds beside the kernel's `RUN_EVENT_REGISTRY`, which `registeredEventOf` asks first. Each name is
 * `<slice>.<snake_case>`. A slice event is always fully specified: no `unspecified` payload, no
 * reserved name. Adding one keeps `LOG_SCHEMA_VERSION`, as a new kernel name does.
 */
import { defineRegistry, entriesOf } from '../../systems/registries/seal'
import type { PayloadFields } from '../eventFields'
import type { RunEventGroup, RunEventLevel } from '../eventNames'

export interface SliceRunEvent {
  group: RunEventGroup
  level: RunEventLevel
  payload: PayloadFields
}

/** A slice's run events keyed by name, the shape of the kernel's registry. */
export type SliceRunEvents = Readonly<Record<string, SliceRunEvent>>

/** One registered event; the registry id is its name. */
export interface RunEventRegistration {
  id: string
  event: SliceRunEvent
}

export const RUN_EVENT_REGISTRATIONS = defineRegistry<RunEventRegistration>('runEvents')

export function runEventRegistrationsOf(events: SliceRunEvents): readonly RunEventRegistration[] {
  return Object.entries(events).map(([name, event]) => ({ id: name, event }))
}

/** The run event a slice registered under this name; undefined when none did. */
export function sliceRunEventOf(name: string): SliceRunEvent | undefined {
  return entriesOf(RUN_EVENT_REGISTRATIONS).find((registration) => registration.id === name)?.event
}

/** Every slice run event by name, sorted by name: what the registry specs check. */
export function sliceRunEvents(): SliceRunEvents {
  return Object.fromEntries(entriesOf(RUN_EVENT_REGISTRATIONS).map(({ id, event }) => [id, event]))
}
