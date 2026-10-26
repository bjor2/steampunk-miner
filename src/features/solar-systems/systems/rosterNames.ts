/**
 * The naming rules of a generated planet (ticket 775, palette section A, in the #159 ledger voice):
 * the full name is `<Prefix> <Noun> <g>`, the prefix drawn from the act's prefixes, the noun from
 * the shared nouns, the number the planet's campaign index `g` (contiguous, `campaignIndex.ts`), so
 * every name of the systems past the first is its own: two addresses there never share a `g`.
 * System 1's authored and generated names carry no `g`, so the sets never meet (the #699 check runs
 * across all systems, names only). The ledger hook fills the palette's template: the folio `g`, the
 * look's ground motif, what the planet pays in (its new ore family, else the act's signature) and,
 * for a new enemy or hazard, what to mind. Names are display only and never reach an id, a command,
 * a snapshot, a log line or a digest.
 */
import type { OreAct } from '../../planet-mix'
import { familyRows } from '../../planet-mix'
import type { BiomeLook, NameParts, NewContentFamily } from './paletteRows'
import { pickedBy } from './rosterDraws'

export interface NameDraws {
  prefix: number
  noun: number
}

/** `<Prefix> <Noun> <g>`: the act's prefix and a noun, each picked by its draw, then the folio. */
export function planetNameOf(
  names: NameParts,
  act: OreAct,
  campaignIndex: bigint,
  draws: NameDraws,
): string {
  const prefix = pickedBy(prefixesOfAct(names, act), draws.prefix)
  const noun = pickedBy(names.nouns, draws.noun)
  return `${prefix} ${noun} ${campaignIndex}`
}

/** The act's prefixes; a palette that names every mixed act never lacks them. */
export function prefixesOfAct(names: NameParts, act: OreAct): readonly string[] {
  const prefixes = names.prefixesByAct[act.id]
  if (prefixes === undefined)
    throw new RangeError(`the palette names no prefixes for act "${act.id}"`)
  return prefixes
}

/** The ledger hook: the template of the slot's kind, filled in. */
export function ledgerHookOf(
  names: NameParts,
  campaignIndex: bigint,
  look: BiomeLook,
  act: OreAct,
  slot: NewContentFamily | null,
): string {
  const isMindful = slot !== null && slot.kind !== 'ore_family'
  const template = isMindful ? names.hookTemplates.mindful : names.hookTemplates.paying
  return template
    .replace('{g}', campaignIndex.toString())
    .replace('{ground}', look.groundMotif)
    .replace('{pays}', paysInOf(act, slot))
    .replace('{mind}', isMindful ? slot.name.toLowerCase() : '')
}

/**
 * The word a generated kind's epithet opens with (ticket 777's "the look's own words"): the
 * palette's own word for its pattern where it names one (ticket 890), else the capitalised id.
 */
export function epithetWordOf(epithetWords: NameParts['epithetWords'], pattern: string): string {
  return epithetWords[pattern] ?? `${pattern.charAt(0).toUpperCase()}${pattern.slice(1)}`
}

/** A new ore family pays; otherwise the act's signature family, or its first common. */
function paysInOf(act: OreAct, slot: NewContentFamily | null): string {
  if (slot !== null && slot.kind === 'ore_family') return slot.name.toLowerCase()
  const family = act.signature ?? act.commons?.[0] ?? null
  return family === null ? 'ore' : familyNameOf(family)
}

function familyNameOf(family: string): string {
  return (
    familyRows()
      .find((row) => row.id === family)
      ?.name.toLowerCase() ?? family
  )
}
