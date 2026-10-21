/**
 * The hazard kind table of the planet registry (ticket 651, spec #647): `ores.economy.json`
 * `planets.hazards`, one entry per hazard a planet row may name, and `planets.hazardCaps`, the
 * most any one contact may cost. Every kind fires the same way, when the drill cuts one of its
 * painted pocket cells (the one hook the build ticket 652 wires, beside the electrified check), and
 * differs in its effect:
 *
 * - `refill` (rockfall): the cut cell fills again with the rubble above it and the rig in it is
 *   crushed for `hullShareBp` of its on-curve hull, as a collapse refill crushes.
 * - `drain` (firedamp): the breached gas chokes the boiler, draining `energyShareBp` of the
 *   on-curve energy over `ticks`.
 * - `bite` (spinecrystal): the shattering cluster scores the hull for `hullShareBp`, once a cell.
 * - `shove` (steam vents): the vent blows, scalding the hull for `hullShareBp` and pushing the rig
 *   `shoveTiles` back up the shaft over `ticks`.
 *
 * The caps are the Horizontal Scaler's "purchasables price-only" condition in numbers: no contact
 * costs more than `hullShareBp` or `energyShareBp`, and a dive never loses more than
 * `diveHullCapBp` to hazards in all (magnetic's own cap, #258). The shares are provisional until
 * the Systems designer retunes them on ticket 644's pace rows; they never touch a power or cost
 * curve.
 */
type Raw = Record<string, unknown>

export type HazardEffect = 'refill' | 'drain' | 'bite' | 'shove'

export type HazardKind =
  | { effect: 'refill'; hullShareBp: number }
  | { effect: 'drain'; energyShareBp: number; ticks: number }
  | { effect: 'bite'; hullShareBp: number }
  | { effect: 'shove'; hullShareBp: number; shoveTiles: number; ticks: number }

export interface HazardCaps {
  /** The most hull one contact costs, in basis points of the on-curve hull. */
  hullShareBp: number
  /** The most energy one contact drains, in basis points of the on-curve energy. */
  energyShareBp: number
  /** The most hull all hazards cost between two dockings, in basis points. */
  diveHullCapBp: number
}

export type HazardKinds = Readonly<Record<string, HazardKind>>

const KINDS_PATH = 'ore.planets.hazards'
const CAPS_PATH = 'ore.planets.hazardCaps'
const BASIS_POINTS = 10000
const EFFECTS: readonly HazardEffect[] = ['refill', 'drain', 'bite', 'shove']
const CAP_FIELDS: readonly (keyof HazardCaps)[] = ['hullShareBp', 'energyShareBp', 'diveHullCapBp']
/** A kind id is one kebab-case word, as a row names it. */
const KIND_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
/** A drain or a shove lasts at most a minute at the fixed step. */
const MAX_TICKS = 3600
const MAX_SHOVE_TILES = 8

/** The number fields each effect carries, beside `effect`. */
const FIELDS_OF_EFFECT: Readonly<Record<HazardEffect, readonly string[]>> = {
  refill: ['hullShareBp'],
  drain: ['energyShareBp', 'ticks'],
  bite: ['hullShareBp'],
  shove: ['hullShareBp', 'shoveTiles', 'ticks'],
}

/** Why the kind table and the caps are not #651's data; empty when they are. */
export function hazardKindProblems(kinds: unknown, caps: unknown): string[] {
  return [...capProblems(caps), ...kindTableProblems(kinds, capsOf(caps))]
}

/** The table typed; call only on a table `hazardKindProblems` accepts. */
export function hazardKindsOf(kinds: Raw): HazardKinds {
  return Object.fromEntries(
    Object.entries(kinds).map(([id, kind]) => [id, kind as HazardKind]),
  ) as HazardKinds
}

/** The caps typed; call only on caps `hazardKindProblems` accepts. */
export function hazardCapsOf(caps: Raw): HazardCaps {
  return {
    hullShareBp: caps.hullShareBp as number,
    energyShareBp: caps.energyShareBp as number,
    diveHullCapBp: caps.diveHullCapBp as number,
  }
}

function capProblems(caps: unknown): string[] {
  if (!isPlainMap(caps))
    return [`${CAPS_PATH} must hold hullShareBp, energyShareBp and diveHullCapBp`]
  return CAP_FIELDS.filter((field) => !isWholeBetween(caps[field], 1, BASIS_POINTS)).map(
    (field) => `${CAPS_PATH}.${field} must be whole, from 1 to ${BASIS_POINTS}`,
  )
}

/** The caps as read, with a cap that is not whole basis points read as the whole range. */
function capsOf(caps: unknown): HazardCaps {
  const raw = isPlainMap(caps) ? caps : {}
  const capOf = (field: keyof HazardCaps) =>
    isWholeBetween(raw[field], 1, BASIS_POINTS) ? (raw[field] as number) : BASIS_POINTS
  return {
    hullShareBp: capOf('hullShareBp'),
    energyShareBp: capOf('energyShareBp'),
    diveHullCapBp: capOf('diveHullCapBp'),
  }
}

function kindTableProblems(kinds: unknown, caps: HazardCaps): string[] {
  if (!isPlainMap(kinds) || Object.keys(kinds).length === 0) {
    return [`${KINDS_PATH} must map each hazard kind to its effect`]
  }
  return Object.entries(kinds).flatMap(([id, kind]) => kindProblems(id, kind, caps))
}

function kindProblems(id: string, kind: unknown, caps: HazardCaps): string[] {
  const where = `${KINDS_PATH}.${id}`
  if (!KIND_ID.test(id)) return [`${where} is not a kebab-case hazard kind id`]
  if (!isPlainMap(kind)) return [`${where} must hold an effect and its numbers`]
  if (!isEffect(kind.effect)) return [`${where}.effect must be refill, drain, bite or shove`]
  return effectFieldProblems(where, kind, kind.effect, caps)
}

function effectFieldProblems(where: string, kind: Raw, effect: HazardEffect, caps: HazardCaps) {
  const fields = FIELDS_OF_EFFECT[effect]
  return [
    ...fields.flatMap((field) => numberProblems(where, field, kind[field], caps)),
    ...Object.keys(kind)
      .filter((field) => field !== 'effect' && !fields.includes(field))
      .map((field) => `${where}.${field} is not a field of the ${effect} effect`),
  ]
}

function numberProblems(where: string, field: string, value: unknown, caps: HazardCaps): string[] {
  const [highest, capName] = rangeOfField(field, caps)
  if (isWholeBetween(value, 1, highest)) return []
  const suffix = capName === null ? '' : ` (hazardCaps.${capName})`
  return [`${where}.${field} must be whole, from 1 to ${highest}${suffix}`]
}

/** The top of a field's range, and the cap it comes from where it is one. */
function rangeOfField(field: string, caps: HazardCaps): [number, keyof HazardCaps | null] {
  if (field === 'hullShareBp') return [caps.hullShareBp, 'hullShareBp']
  if (field === 'energyShareBp') return [caps.energyShareBp, 'energyShareBp']
  if (field === 'shoveTiles') return [MAX_SHOVE_TILES, null]
  return [MAX_TICKS, null]
}

function isEffect(value: unknown): value is HazardEffect {
  return (EFFECTS as readonly unknown[]).includes(value)
}

export function isWholeBetween(value: unknown, lowest: number, highest: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= lowest && (value as number) <= highest
}

function isPlainMap(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
