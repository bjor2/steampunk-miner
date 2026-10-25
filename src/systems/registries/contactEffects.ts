/**
 * The contact-effect registry (ticket 848; the GD lock on #823 Q1, the HS's one generic registry
 * where a new hazard is a data row, the TD's `{kind, effect, factorBp}` rows): what a hazard pocket
 * does to the rig that meets it, keyed by hazard kind. The `ores` slice registers one row per kind
 * of its planet registry's hazard table (ticket 651); the kernel plays the four effects
 * (`authority/hazards/`):
 *
 * - `refill` (rockfall): the cut cell fills again by `refillShareBp` of its cut, and the rubble
 *   crushes the rig for `hullShareBp`.
 * - `drain` (firedamp): while the rig stands in a cut pocket its tank drains `energyShareBp` of the
 *   owned energy track every `ticks`, never below `floorBp` of it.
 * - `bite` (spinecrystal): the cluster bites the hull for `hullShareBp`, once a cell.
 * - `shove` (steam vents): the vent scalds the hull for `hullShareBp` and shoves the rig
 *   `shoveTiles` along its normal over `ticks`.
 *
 * Hull shares are basis points of the planet's on-curve hull, the hull law at g, from the arc the
 * cell lies in, and a dive's contacts never take more than the row's `diveHullCapBp` in all. **Factors.** A row's `factorBp` scales every number of its effect, and a tool or
 * consumable answers a factor hook for a kind (`contactFactors`), the smallest answer applying on
 * top, never stacked. A factor of 0 plays nothing and says nothing, so a replay with every factor
 * at 0 is byte-identical to one with no rows at all.
 */
import { BASIS_POINTS } from '../../constants/balance'
import type { AuthorityState } from '../authority/authorityState'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export type ContactEffect = 'refill' | 'drain' | 'bite' | 'shove'

interface ContactRowFields {
  /** `<slice>.<kind>`. */
  id: string
  /** The hazard kind a pocket read answers (`hazardPockets.ts`). */
  kind: string
  /** The scale on every number of the effect, 0 to 10000 bp. */
  factorBp: number
  /** The most on-curve hull, in bp, hazard contacts take from one dive in all, this one's too. */
  diveHullCapBp: number
}

export type ContactEffectRow = ContactRowFields &
  (
    | { effect: 'refill'; refillShareBp: number; hullShareBp: number }
    | { effect: 'drain'; energyShareBp: number; ticks: number; floorBp: number }
    | { effect: 'bite'; hullShareBp: number }
    | { effect: 'shove'; hullShareBp: number; shoveTiles: number; ticks: number }
  )

export type ContactRowOf<E extends ContactEffect> = Extract<ContactEffectRow, { effect: E }>

/** A tool's or a consumable's factor on one kind's contacts, while it applies. */
export interface ContactFactor {
  id: string
  kind: string
  /** The factor on the player's contacts with `kind` now, in bp, or null while it does not apply. */
  factorBpOf(state: AuthorityState, playerId: string): number | null
}

export const CONTACT_EFFECT_REGISTRY = defineRegistry<ContactEffectRow>('contactEffects', (rows) =>
  sharedKindProblemOf(rows),
)

export const CONTACT_FACTOR_REGISTRY = defineRegistry<ContactFactor>('contactFactors')

/** The row of hazard `kind`, or null when no slice registered one. */
export function contactEffectOf(kind: string): ContactEffectRow | null {
  return entriesOf(CONTACT_EFFECT_REGISTRY).find((row) => row.kind === kind) ?? null
}

/** The row's factor with the smallest factor hook answering for its kind on top, in bp. */
export function contactFactorBpOf(
  state: AuthorityState,
  playerId: string,
  row: ContactEffectRow,
): number {
  const hooked = hookedFactorBpOf(state, playerId, row.kind)
  return Math.floor((wholeShareOf(row.factorBp) * hooked) / BASIS_POINTS)
}

/** `bp` scaled by `factorBp`, rounded down. */
export function scaledByFactor(bp: number, factorBp: number): number {
  return Math.floor((bp * factorBp) / BASIS_POINTS)
}

function hookedFactorBpOf(state: AuthorityState, playerId: string, kind: string): number {
  const answers = entriesOf(CONTACT_FACTOR_REGISTRY)
    .filter((hook) => hook.kind === kind)
    .map((hook) => hook.factorBpOf(state, playerId))
    .filter((factor): factor is number => factor !== null)
  return Math.min(BASIS_POINTS, ...answers.map(wholeShareOf))
}

function wholeShareOf(bp: number): number {
  return Math.min(BASIS_POINTS, Math.max(0, Math.floor(bp)))
}

function sharedKindProblemOf(
  registrations: readonly SealedRegistration<ContactEffectRow>[],
): string | null {
  const kinds = registrations.map(({ entry }) => entry.kind)
  const shared = kinds.filter((kind, at) => kinds.indexOf(kind) !== at)
  if (shared.length === 0) return null
  return `contact effects refused: kind ${[...new Set(shared)].join(', ')} has more than one row`
}
