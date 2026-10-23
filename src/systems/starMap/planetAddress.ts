/**
 * A planet's star-map address (ticket 754, the TD architecture in the GD lock on #650, comment
 * 6361556890): its solar system `s` and its place `p` in that system, both from 1. Indexes are
 * bigint, since neither the systems nor a system's planets have a bound; they cross JSON (a save, a
 * command, a log line) as canonical decimal strings, read back here and nowhere else.
 */

export const FIRST_SYSTEM = 1n
export const FIRST_PLANET = 1n

/** Throws on an address outside the map: a system or a planet below 1. */
export function assertValidAddress(system: bigint, planet: bigint): void {
  if (system < FIRST_SYSTEM) throw new RangeError(`system must be 1 or more, got ${system}`)
  if (planet < FIRST_PLANET) throw new RangeError(`planet must be 1 or more, got ${planet}`)
}

/** An address index as JSON carries it: its canonical decimal string. */
export function toIndexText(index: bigint): string {
  return index.toString()
}

/** The index a canonical decimal string from 1 names; null for anything else, `"01"` included. */
export function readIndexText(text: unknown): bigint | null {
  return isCanonicalIndexText(text) ? BigInt(text) : null
}

function isCanonicalIndexText(text: unknown): text is string {
  return typeof text === 'string' && /^[1-9]\d*$/.test(text)
}
