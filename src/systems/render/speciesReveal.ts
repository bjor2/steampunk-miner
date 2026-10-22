/**
 * Which of the planet's species a step let the player meet (GD ruling on #698, option 2): a
 * species draws its skin from the first frame, and on first contact its rarity overlay arrives as
 * a one-time flourish. A species is revealed when `before` did not show the player its rarity and
 * `after` does, on one planet with the `codex.materialContact` switch on in both, so flipping the
 * switch, travelling or restoring a save reveals nothing. The codex writes `material:<species id>`
 * once per player, so each species is revealed once. Look only: nothing reads it for a price,
 * gate or income, and it never writes the record.
 */
import type { AuthorityState } from '../authority/authorityState'
import { flagsOf } from '../authority/devFlagState'
import { planetParamsOf } from '../authority/planetOfState'
import type { KindLookProvider } from '../registries/kindLook'
import type { KindLook } from './kindLookTable'
import { hasSeenSpecies } from './speciesSighting'

/** A species the player has just met: its roster slot (1 first) and its rarity lead. */
export interface SpeciesReveal {
  slot: number
  speciesId: string
  rarityLead: number
}

export function speciesRevealsBetween(
  before: AuthorityState,
  after: AuthorityState,
  playerId: string,
  provider: KindLookProvider,
): SpeciesReveal[] {
  if (!mayRevealBetween(before, after, playerId)) return []
  const params = planetParamsOf(after.planet)
  if (params === null) return []
  return provider
    .kindLooksOf(params)
    .flatMap((look, at) => revealOf(before, after, playerId, provider, look, at + 1))
}

/** The same planet, the player's codex rewritten and the switch on before and after. */
function mayRevealBetween(before: AuthorityState, after: AuthorityState, playerId: string) {
  return (
    isSamePlanet(before, after) &&
    hasRewrittenSightings(before, after, playerId) &&
    flagsOf(before)['codex.materialContact']
  )
}

function isSamePlanet(before: AuthorityState, after: AuthorityState): boolean {
  return before.planet.index === after.planet.index && before.planet.seed === after.planet.seed
}

/** Sightings are player sections: untouched sections met no species, so the roster is not read. */
function hasRewrittenSightings(before: AuthorityState, after: AuthorityState, playerId: string) {
  return before.players[playerId]?.slices !== after.players[playerId]?.slices
}

function revealOf(
  before: AuthorityState,
  after: AuthorityState,
  playerId: string,
  provider: KindLookProvider,
  look: KindLook | null,
  slot: number,
): SpeciesReveal[] {
  if (look === null) return []
  if (hasSeenSpecies(before, playerId, provider, look.speciesId)) return []
  if (!hasSeenSpecies(after, playerId, provider, look.speciesId)) return []
  return [{ slot, speciesId: look.speciesId, rarityLead: look.rarityLead }]
}
