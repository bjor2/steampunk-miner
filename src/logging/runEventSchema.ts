/**
 * Validates a logged event against the envelope and the schema registry (#11 section 1 and
 * acceptance 2): an unregistered, reserved or unspecified event, an unknown field, a wrong kind,
 * or a float outside `perf_sample`/`timestamp` is a listed problem. Used by the specs on what the
 * game emits, and by the comparison tool on files it reads.
 */
import {
  declaredFieldProblems,
  isJsonObject,
  payloadProblems,
  type FieldKind,
  type PayloadFields,
} from './eventFields'
import { registeredEventOf, type RegisteredEvent } from './eventNames'
import { ENVELOPE_FIELDS, LOG_SCHEMA_VERSION } from './runEvent'

export function runEventProblems(event: unknown): string[] {
  if (!isJsonObject(event)) return ['event line must be an object']
  return [
    ...envelopeShapeProblems(event),
    ...declaredFieldProblems(event, ENVELOPE_KINDS, 'envelope'),
    ...commandRefProblems(event.cmd),
    ...eventDataProblems(event.event, event.data),
  ]
}

/** The envelope's scalar fields; `cmd`, `event` and `data` are checked by their own rules. */
const ENVELOPE_KINDS: PayloadFields = {
  v: 'integer',
  seq: 'integer',
  tick: 'integer',
  timestamp: 'float',
  runId: 'text',
  playerId: 'text',
  planet: 'integer',
  depthTiles: 'integer',
}

function envelopeShapeProblems(event: Record<string, unknown>): string[] {
  return [
    ...(event.v === LOG_SCHEMA_VERSION ? [] : [`v must be ${LOG_SCHEMA_VERSION}`]),
    ...Object.keys(event)
      .filter((name) => !(ENVELOPE_FIELDS as readonly string[]).includes(name))
      .map((name) => `envelope.${name} is not an envelope field`),
  ]
}

function commandRefProblems(cmd: unknown): string[] {
  if (cmd === undefined || isCommandRef(cmd)) return []
  return ['envelope.cmd must be [tick, seq] as two safe integers']
}

function isCommandRef(cmd: unknown): boolean {
  return Array.isArray(cmd) && cmd.length === 2 && cmd.every(Number.isSafeInteger)
}

function eventDataProblems(name: unknown, data: unknown): string[] {
  if (typeof name !== 'string') return ['envelope.event must be a string']
  const registered = registeredEventOf(name)
  if (registered === undefined) return [`event "${name}" is not registered`]
  return registeredDataProblems(name, registered, data)
}

function registeredDataProblems(name: string, registered: RegisteredEvent, data: unknown) {
  if (registered.payload === 'reserved') return [`event "${name}" is reserved, not emitted`]
  if (registered.payload === 'unspecified') {
    return [`event "${name}" has no registered payload yet (dev builds only)`]
  }
  return payloadProblems(data, registered.payload, name)
}

/** Payload fields that repeat an envelope field, across the registry (#11 amendment 1). */
export function envelopeDuplicateProblems(
  registry: Readonly<Record<string, RegisteredEvent>>,
): string[] {
  return Object.entries(registry).flatMap(([name, registered]) =>
    typeof registered.payload === 'string' ? [] : duplicatesIn(name, registered.payload),
  )
}

function duplicatesIn(name: string, fields: PayloadFields): string[] {
  return Object.keys(fields)
    .filter((field) => (ENVELOPE_FIELDS as readonly string[]).includes(field))
    .map((field) => `${name}.${field} repeats an envelope field`)
}

/** Events allowed a float field: only `perf_sample` (#11 section 1, value rules). */
export function floatFieldProblems(registry: Readonly<Record<string, RegisteredEvent>>): string[] {
  return Object.entries(registry).flatMap(([name, registered]) =>
    name === 'perf_sample' || typeof registered.payload === 'string'
      ? []
      : floatsIn(name, registered.payload),
  )
}

function floatsIn(name: string, fields: PayloadFields): string[] {
  return Object.entries(fields)
    .filter(([, kind]) => holdsFloat(kind))
    .map(([field]) => `${name}.${field} is a float outside perf_sample`)
}

function holdsFloat(kind: FieldKind): boolean {
  if (typeof kind === 'string') return kind === 'float'
  if ('listOf' in kind) return Object.values(kind.listOf).some(holdsFloat)
  if ('mapOf' in kind) return holdsFloat(kind.mapOf)
  return false
}
