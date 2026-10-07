/**
 * Reading a player's codex (#207): the kernel `discovery` query answers `contacted` (#172 GD
 * rulings: tech-tree nodes read contacted, which mined implies), and `hasMinedOre` answers `mined`
 * for the #178 plaque. Keys are canonicalised through the alias tables on the way in, and ore bytes
 * a save wrote under the kernel index are read through the same move a write makes once (#146).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  canonicalDiscoveryKey,
  type DiscoveryKey,
  type DiscoveryProvider,
} from '../../../systems/registries/discovery'
import { oreBitIndexOf, oreIndexTag } from '../../../systems/registries/oreTypes'
import { readSection } from '../../../systems/registries/saveSections'
import { hasBit } from './bitset'
import {
  CODEX_SECTION,
  oreDiscoveriesOf,
  type CodexSection,
  type IdDiscoveries,
} from './codexSection'
import { oreOfKey } from './oreBits'
import { oreBitsOf } from './oreRecords'

export const CODEX_DISCOVERY_PROVIDER: DiscoveryProvider = {
  id: 'codex.discovery',
  hasDiscovered: hasContacted,
}

/** Whether the player touched (or mined) what the key names; false for an unknown player. */
export function hasContacted(state: AuthorityState, playerId: string, key: DiscoveryKey): boolean {
  const section = codexOf(state, playerId)
  if (section === null) return false
  return isOreKey(key) ? hasOreBit(section, key, 'contacted') : hasContactedId(section, key)
}

/** Whether a unit of this ore reached the player's hold. */
export function hasMinedOre(state: AuthorityState, playerId: string, oreId: string): boolean {
  const section = codexOf(state, playerId)
  return section !== null && hasOreBit(section, `ore:${oreId}`, 'mined')
}

/** The player's section; null for a player the state does not hold. */
export function codexOf(state: AuthorityState, playerId: string): CodexSection | null {
  if (!Object.hasOwn(state.players, playerId)) return null
  return readSection(state, playerId, CODEX_SECTION)
}

function isOreKey(key: DiscoveryKey): key is `ore:${string}` {
  return key.startsWith('ore:')
}

function hasOreBit(section: CodexSection, key: `ore:${string}`, stage: 'contacted' | 'mined') {
  const ore = oreOfKey(key)
  if (ore === null) return false
  const bits = oreBitsOf(oreDiscoveriesOf(section, oreIndexTag()))
  return hasBit(bits[stage], oreBitIndexOf(ore))
}

function hasContactedId(section: CodexSection, key: DiscoveryKey): boolean {
  const canonical = canonicalDiscoveryKey(key)
  const kind = canonical.slice(0, canonical.indexOf(':'))
  const entry = section[kind] as IdDiscoveries | undefined
  return (entry?.contacted ?? []).some(
    (id) => canonicalDiscoveryKey(`${kind}:${id}` as DiscoveryKey) === canonical,
  )
}
