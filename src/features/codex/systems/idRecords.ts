/**
 * Folding a step's enemy and hazard keys into one player's `ids` kinds (ticket 252): the first
 * time a key is met its id joins the kind's sorted `contacted` list and `codex.EntryAdded` says
 * so; a key already there says nothing, so each comes once per player however often it is met.
 * Keys are canonicalised through the alias tables on the write (#178 TD lock), as the reads do.
 */
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import { canonicalDiscoveryKey, type DiscoveryKey } from '../../../systems/registries/discovery'
import {
  idDiscoveriesOf,
  withIdDiscoveries,
  type CodexSection,
  type IdDiscoveries,
} from './codexSection'

export interface IdRecord {
  section: CodexSection
  events: DomainEventBody[]
}

/** The section after the keys; unchanged, with no events, when every key was already there. */
export function recordIdContacts(section: CodexSection, keys: readonly DiscoveryKey[]): IdRecord {
  return keys.map(canonicalDiscoveryKey).reduce(recordIdContact, { section, events: [] })
}

function recordIdContact(recorded: IdRecord, key: DiscoveryKey): IdRecord {
  const kind = key.slice(0, key.indexOf(':'))
  const id = key.slice(kind.length + 1)
  const entry = idDiscoveriesOf(recorded.section, kind)
  if (entry.contacted.includes(id)) return recorded
  return {
    section: withIdDiscoveries(recorded.section, kind, withContactedId(entry, id)),
    events: [...recorded.events, { type: 'codex.EntryAdded', key, stage: 'contacted' }],
  }
}

/** `contacted` in code-unit order, as the section's problems check it; `mined` kept as it was. */
function withContactedId(entry: IdDiscoveries, id: string): IdDiscoveries {
  return { ...entry, contacted: [...entry.contacted, id].sort() }
}
