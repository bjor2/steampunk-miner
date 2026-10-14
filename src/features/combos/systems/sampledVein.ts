/**
 * The vein the corer last sampled, kept for the cored drain (GD lock on #206: "keeps the sampled
 * vein from the kernel `OreSampled` event through an authority reaction into combos' own
 * section"). The reaction hears the corer's `OreSampled {via: corer}` and keeps the newest plug of
 * a player who owns the cored drain, with the planet it was taken on; nobody else's state changes,
 * so the section stays out of the state, and out of every digest, until the combo is in play.
 *
 * Section `combos`, v1, player scope: `{ vein: { planetIndex, tx, ty, oreId } | null }`. Restored
 * by exact version match, never migrated (feature-slices.md 3.13).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'

export const CORED_DRAIN_ID = 'combo.cored_drain'

/** The plug the corer took: where, which ore, on which planet. */
export interface SampledVein {
  planetIndex: number
  tx: number
  ty: number
  oreId: string
}

export interface ComboSection {
  vein: SampledVein | null
}

type OreSampled = Extract<DomainEvent, { type: 'OreSampled' }>

const NO_VEIN: ComboSection = { vein: null }

export const COMBO_SECTION: SaveSection<ComboSection> = {
  id: 'combos',
  version: 1,
  scope: 'player',
  initial: NO_VEIN,
  problems: comboSectionProblems,
  toPortable: (section) => ({ vein: section.vein === null ? null : { ...section.vein } }),
  ofPortable: (body) => body as ComboSection,
}

export const SAMPLED_VEIN_REACTION: AuthorityReaction = {
  id: 'combos.sampled-vein',
  react: keepSampledVeins,
}

/** The vein the player's corer last sampled on the planet the state is on; null for none. */
export function sampledVeinOf(state: AuthorityState, playerId: string): SampledVein | null {
  const { vein } = readSection(state, playerId, COMBO_SECTION)
  return vein !== null && vein.planetIndex === state.planet.index ? vein : null
}

function keepSampledVeins(
  _before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  return unchanged(heard.filter(isCorerPlug).reduce(keptVeinOf, after))
}

function isCorerPlug(event: DomainEvent): event is OreSampled {
  return event.type === 'OreSampled' && event.via === 'corer'
}

/** The plug kept for its player, when they own the cored drain. */
function keptVeinOf(state: AuthorityState, plug: OreSampled): AuthorityState {
  const { playerId, tx, ty, oreId } = plug
  if (!Object.hasOwn(state.players, playerId) || !ownsItem(state, playerId, CORED_DRAIN_ID)) {
    return state
  }
  const vein = { planetIndex: state.planet.index, tx, ty, oreId }
  return withSection(state, playerId, COMBO_SECTION, { vein })
}

function comboSectionProblems(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return ['combos must be an object']
  const { vein } = body as { vein?: unknown }
  return vein === null || isSampledVein(vein) ? [] : ['combos.vein must be null or a sampled vein']
}

function isSampledVein(value: unknown): value is SampledVein {
  if (typeof value !== 'object' || value === null) return false
  const { planetIndex, tx, ty, oreId } = value as Record<string, unknown>
  const integers = [planetIndex, tx, ty].every((field) => Number.isSafeInteger(field))
  return integers && typeof oreId === 'string'
}
