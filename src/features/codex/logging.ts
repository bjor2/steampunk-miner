/**
 * The codex's run-log lines (#207, feature-slices.md 3.15): each domain event projects to its
 * `codex.<snake_case>` run event with the same fields. Outside `systems/`, which may not import
 * logging types.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import type { OreFacts } from './systems/codexEvents'

const ORE_FACTS = { oreId: 'text', family: 'text', tier: 'integer', grade: 'integer' } as const

export const CODEX_PROJECTIONS: SliceEventProjections = {
  'codex.OreContacted': (contact) => ({
    event: 'codex.ore_contacted',
    data: { ...oreFactsOf(contact), via: contact.via },
  }),
  'codex.OreDiscovered': (facts) => ({ event: 'codex.ore_discovered', data: oreFactsOf(facts) }),
  'codex.EntryAdded': ({ key, stage }) => ({ event: 'codex.entry_added', data: { key, stage } }),
}

/** The ore's fields alone: the projection is handed the whole stamped event. */
function oreFactsOf({ oreId, family, tier, grade }: OreFacts): OreFacts {
  return { oreId, family, tier, grade }
}

export const CODEX_RUN_EVENTS: SliceRunEvents = {
  'codex.ore_contacted': {
    group: 'progression',
    level: 'core',
    payload: { ...ORE_FACTS, via: { oneOf: ['drill', 'gate', 'cargo'] } },
  },
  'codex.ore_discovered': { group: 'progression', level: 'core', payload: ORE_FACTS },
  'codex.entry_added': {
    group: 'progression',
    level: 'core',
    payload: { key: 'text', stage: { oneOf: ['contacted', 'mined'] } },
  },
}
