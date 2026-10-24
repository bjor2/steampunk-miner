/**
 * Fail-on-recolour for the generated material pools (ticket 777; the HS input on the Campaign
 * Scaling lock: a later system's content is never the first system's with a new colour). A kind is
 * a recolour when it wears a silhouette + pattern pair a first-system species wears (whatever its hue
 * slot), or carries a first-system species' id, epithet or name. The family-level check of the same
 * rule is `newContentSlots.test.ts` and `familyBehaviours.ts`.
 */
import { MATERIALS } from '../../materials'
import type { MaterialPool, PoolKind } from './materialPool'
import { pairKeyOf, POOL_LOOK_CATALOGUE } from './poolKindLooks'

/** The first system's species as the check reads them: their looks and their words. */
export interface FirstSystemSpecies {
  pairs: ReadonlySet<string>
  /** Ids, epithets and names, normalised. */
  words: ReadonlySet<string>
}

export const FIRST_SYSTEM_SPECIES: FirstSystemSpecies = {
  pairs: POOL_LOOK_CATALOGUE.firstSystemPairs,
  words: new Set(
    MATERIALS.materials
      .flatMap((species) => [species.id, species.epithet, species.name])
      .map(normalisedWord),
  ),
}

/** Every kind of the pools that recolours a first-system species, with why. */
export function recolouredKindProblemsOf(
  pools: readonly MaterialPool[],
  firstSystem: FirstSystemSpecies = FIRST_SYSTEM_SPECIES,
): string[] {
  return pools.flatMap((pool) => pool.kinds.flatMap((kind) => kindRecolourOf(kind, firstSystem)))
}

function kindRecolourOf(kind: PoolKind, firstSystem: FirstSystemSpecies): string[] {
  const pair = pairKeyOf(kind.silhouette, kind.pattern)
  const words = [kind.id, kind.epithet, kind.name].filter((word) =>
    firstSystem.words.has(normalisedWord(word)),
  )
  return [
    ...(firstSystem.pairs.has(pair)
      ? [`${kind.id} wears ${pair}, a first-system species' look`]
      : []),
    ...words.map((word) => `${kind.id} carries "${word}", a first-system species' word`),
  ]
}

function normalisedWord(text: string): string {
  return text.toLowerCase().replace(/[\s_-]+/g, '')
}
