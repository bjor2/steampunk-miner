/**
 * Whether a player has met an ore, enemy or hazard (docs/standards/feature-slices.md 3.12): the
 * `codex` slice provides the answer; `tech-tree` and `sensing` ask here and never import `codex`.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { UnlockProgress } from '../unlocks/unlockSchedule'
import { defineOneProviderRegistry, entriesOf } from './seal'

export type DiscoveryKey = `ore:${string}` | `enemy:${string}` | `hazard:${string}`

export interface DiscoveryProvider {
  id: string
  hasDiscovered(state: AuthorityState, playerId: string, key: DiscoveryKey): boolean
}

export interface DiscoveryFallback {
  progress: UnlockProgress
  unlockPlanetIndex: number
}

export const DISCOVERY_REGISTRY = defineOneProviderRegistry<DiscoveryProvider>('discovery')

/** Provider answer, else the fallback: discovered once the node's unlock planet is reached. */
export function hasDiscovered(
  state: AuthorityState,
  playerId: string,
  key: DiscoveryKey,
  fallback: DiscoveryFallback,
): boolean {
  const [provider] = entriesOf(DISCOVERY_REGISTRY)
  if (provider === undefined) return hasReachedUnlockPlanet(fallback)
  return provider.hasDiscovered(state, playerId, key)
}

function hasReachedUnlockPlanet({ progress, unlockPlanetIndex }: DiscoveryFallback): boolean {
  return progress.highestPlanetIndex >= unlockPlanetIndex
}
