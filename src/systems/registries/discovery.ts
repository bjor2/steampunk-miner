/**
 * Whether a player has met an ore, enemy or hazard (docs/standards/feature-slices.md 3.12): the
 * `codex` slice provides the answer; `tech-tree` and `sensing` ask here and never import `codex`.
 *
 * Kinds are open (#209, from the #178 TD rulings): ore, enemy and hazard are kernel kinds, and a
 * slice adds its own by module augmentation, naming the kind's storage codec as the value:
 *
 *   declare module '<path to>/systems/registries/discovery' {
 *     interface DiscoveryKinds { artefact: 'ids' }
 *   }
 *
 * then registers it with `r.discoveryKind('artefact')`, so the codec is known at run time too.
 * A slice may also register an alias table the codex canonicalises keys through, so a renamed id
 * (the kernel ore id to its #146 `typeId`) needs no section migration.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { UnlockProgress } from '../unlocks/unlockSchedule'
import { defineOneProviderRegistry, defineRegistry, entriesOf } from './seal'

/** `ids`: a sorted id list. `bitset`: base64 bytes indexed by the kind's owner (only `ore`). */
export type DiscoveryCodec = 'ids' | 'bitset'

/** Append-only; slices add kinds by module augmentation. Each value is the kind's codec. */
export interface DiscoveryKinds {
  ore: 'bitset'
  enemy: 'ids'
  hazard: 'ids'
}

export type DiscoveryKind = keyof DiscoveryKinds

export type DiscoveryKey = `${DiscoveryKind}:${string}`

/** `ids`, the default, may be left out; any other codec is named where the kind registers. */
export type DiscoveryCodecArgument<K extends DiscoveryKind> = DiscoveryKinds[K] extends 'ids'
  ? [codec?: 'ids']
  : [codec: DiscoveryKinds[K]]

/** A slice-declared kind; the registry id is the kind, so a kind registers once across slices. */
export interface DiscoveryKindRegistration {
  id: DiscoveryKind
  codec: DiscoveryCodec
}

/** Maps a key some slice once wrote to the key it is known by now. */
export interface DiscoveryAliasTable {
  id: string
  aliases: Readonly<Partial<Record<DiscoveryKey, DiscoveryKey>>>
}

export interface DiscoveryProvider {
  id: string
  hasDiscovered(state: AuthorityState, playerId: string, key: DiscoveryKey): boolean
}

export interface DiscoveryFallback {
  progress: UnlockProgress
  unlockPlanetIndex: number
}

export const DISCOVERY_REGISTRY = defineOneProviderRegistry<DiscoveryProvider>('discovery')
export const DISCOVERY_KIND_REGISTRY = defineRegistry<DiscoveryKindRegistration>('discoveryKinds')
export const DISCOVERY_ALIAS_REGISTRY = defineRegistry<DiscoveryAliasTable>('discoveryAliases')

const KERNEL_DISCOVERY_KINDS: readonly DiscoveryKindRegistration[] = Object.freeze([
  { id: 'enemy', codec: 'ids' },
  { id: 'hazard', codec: 'ids' },
  { id: 'ore', codec: 'bitset' },
])

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

export function discoveryKindRegistrationOf<K extends DiscoveryKind>(
  kind: K,
  ...[codec]: DiscoveryCodecArgument<K>
): DiscoveryKindRegistration {
  return { id: kind, codec: codec ?? 'ids' }
}

export function isKernelDiscoveryKind(kind: string): boolean {
  return KERNEL_DISCOVERY_KINDS.some((registration) => registration.id === kind)
}

/** The kernel kinds and every registered one, sorted by kind. */
export function discoveryKinds(): readonly DiscoveryKindRegistration[] {
  return [...KERNEL_DISCOVERY_KINDS, ...entriesOf(DISCOVERY_KIND_REGISTRY)].sort(compareKinds)
}

/** The kind's codec; `ids` for a kind declared by augmentation but never registered. */
export function discoveryCodecOf(kind: DiscoveryKind): DiscoveryCodec {
  return discoveryKinds().find((registration) => registration.id === kind)?.codec ?? 'ids'
}

/** The key through the first alias table, in id order, that maps it; else the key itself. */
export function canonicalDiscoveryKey(key: DiscoveryKey): DiscoveryKey {
  const table = entriesOf(DISCOVERY_ALIAS_REGISTRY).find(({ aliases }) =>
    Object.hasOwn(aliases, key),
  )
  return table?.aliases[key] ?? key
}

function hasReachedUnlockPlanet({ progress, unlockPlanetIndex }: DiscoveryFallback): boolean {
  return progress.highestPlanetIndex >= unlockPlanetIndex
}

/** Code-unit order, as the registries sort, so every machine lists kinds the same way. */
function compareKinds(a: DiscoveryKindRegistration, b: DiscoveryKindRegistration): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}
