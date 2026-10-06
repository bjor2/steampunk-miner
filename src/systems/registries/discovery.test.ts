import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import type { UnlockProgress } from '../unlocks/unlockSchedule'
import { DISCOVERY_REGISTRY, hasDiscovered } from './discovery'
import { addToRegistry, withFreshRegistrySet } from './seal'

const STATE = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
const ON_PLANET_3: UnlockProgress = {
  highestPlanetIndex: 3,
  collectedArtefactRowIds: new Set(),
  builtFacilityRowIds: new Set(),
  manualUnlockRowIds: new Set(),
}

function discoveredWithFallback(unlockPlanetIndex: number): boolean {
  return hasDiscovered(STATE, 'p1', 'ore:copper', { progress: ON_PLANET_3, unlockPlanetIndex })
}

describe('discovery registry', () => {
  it('counts a key discovered once its unlock planet is reached, with no provider', () => {
    const answers = withFreshRegistrySet(
      () => undefined,
      () => [discoveredWithFallback(3), discoveredWithFallback(4)],
    )
    expect(answers).toEqual([true, false])
  })

  it("answers with the provider's verdict when one is registered", () => {
    const answer = withFreshRegistrySet(
      () =>
        addToRegistry(DISCOVERY_REGISTRY, 'codex', {
          id: 'codex.discovery',
          hasDiscovered: (_state, _player, key) => key === 'ore:copper',
        }),
      () => [
        discoveredWithFallback(9),
        hasDiscovered(STATE, 'p1', 'enemy:crawler', {
          progress: ON_PLANET_3,
          unlockPlanetIndex: 1,
        }),
      ],
    )
    expect(answer).toEqual([true, false])
  })
})
