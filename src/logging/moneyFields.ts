/**
 * The Money fields of a logged event, read through the schema registry (#11 section 1): every
 * field the registry declares `money`, however deep it sits in a list, a map or an optional, with
 * the name of the field that holds it. The P200 money lane (ticket 340) finds each planet's largest
 * amount, price and income from them without a list of events that carry money.
 */
import { isJsonObject, type FieldKind, type PayloadFields } from './eventFields'
import { registeredEventOf } from './eventNames'
import type { RunEvent } from './runEvent'

export interface MoneyField {
  /** The field's own name; a map's values take the map's name. */
  readonly field: string
  readonly text: string
}

export function moneyFieldsOf(event: RunEvent): MoneyField[] {
  const registered = registeredEventOf(event.event)
  if (registered === undefined || typeof registered.payload === 'string') return []
  return moneyInFields(event.data, registered.payload)
}

function moneyInFields(payload: unknown, fields: PayloadFields): MoneyField[] {
  if (!isJsonObject(payload)) return []
  return Object.entries(fields).flatMap(([field, kind]) =>
    moneyInValue(payload[field], kind, field),
  )
}

function moneyInValue(value: unknown, kind: FieldKind, field: string): MoneyField[] {
  if (kind === 'money') return typeof value === 'string' ? [{ field, text: value }] : []
  if (typeof kind === 'string' || 'oneOf' in kind) return []
  if ('optional' in kind) return moneyInOptional(value, kind.optional, field)
  if ('listOf' in kind) return moneyInList(value, kind.listOf)
  return moneyInMap(value, kind.mapOf, field)
}

function moneyInOptional(value: unknown, kind: FieldKind, field: string): MoneyField[] {
  return value === undefined ? [] : moneyInValue(value, kind, field)
}

function moneyInList(value: unknown, itemFields: PayloadFields): MoneyField[] {
  return Array.isArray(value) ? value.flatMap((item) => moneyInFields(item, itemFields)) : []
}

function moneyInMap(value: unknown, valueKind: FieldKind, field: string): MoneyField[] {
  if (!isJsonObject(value)) return []
  return Object.values(value).flatMap((entry) => moneyInValue(entry, valueKind, field))
}
