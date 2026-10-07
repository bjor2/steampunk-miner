/**
 * The codex's authority reaction (#207 TD lock, feature-slices.md 3.21): it hears one player's
 * events of an accepted command or a settled tick and folds the ore, enemies and hazards they met
 * into that player's `codex` section, answering `codex.*` events in the same answer, so headless, bot and
 * golden runs record discoveries exactly as play does and no client asserts one.
 *
 * Contact is the drill's damage on an ore tile, read on the state before the command (the
 * `DrillDamageDealt` event names no ore), or a gate stopping the drill at one (`DrillGated`); a
 * unit reaching the hold (`CargoAdded`, drill or blast) is mined. Enemies and hazards are only
 * ever contacted (ticket 252, `contactKeys.ts`), recorded after the step's ore.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import type { OreType } from '../../../systems/registries/oreTypes'
import { oreIndexTag } from '../../../systems/registries/oreTypes'
import { readSection, withSection } from '../../../systems/registries/saveSections'
import type { ContactRoute } from './codexEvents'
import { CODEX_SECTION, oreDiscoveriesOf, withOreDiscoveries } from './codexSection'
import { contactKeysOf } from './contactKeys'
import { recordIdContacts } from './idRecords'
import { oreNamed } from './oreBits'
import { recordOreTouches, type OreTouch } from './oreRecords'

export const CODEX_DISCOVERY_REACTION: AuthorityReaction = {
  id: 'codex.discovery',
  react: recordDiscoveriesHeard,
}

function recordDiscoveriesHeard(
  before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const playerId = playerOfHeard(after, heard)
  if (playerId === null) return unchanged(after)
  return chainEffects(after, [
    (current) => recordOreTouchesFor(current, playerId, oreTouchesOf(before, heard)),
    (current) => recordContactsFor(current, playerId, contactKeysOf(before, after, heard)),
  ])
}

/** The player the events belong to (the run groups them per player); null for the clock's own. */
function playerOfHeard(state: AuthorityState, heard: readonly DomainEvent[]): string | null {
  const playerId = heard[0]?.playerId
  return playerId !== undefined && Object.hasOwn(state.players, playerId) ? playerId : null
}

function recordOreTouchesFor(
  state: AuthorityState,
  playerId: string,
  touches: readonly OreTouch[],
): RuleEffect {
  if (touches.length === 0) return unchanged(state)
  const section = readSection(state, playerId, CODEX_SECTION)
  const record = recordOreTouches(oreDiscoveriesOf(section, oreIndexTag()), touches)
  if (record.events.length === 0) return unchanged(state)
  const written = withOreDiscoveries(section, record.ore)
  return { state: withSection(state, playerId, CODEX_SECTION, written), events: record.events }
}

function recordContactsFor(
  state: AuthorityState,
  playerId: string,
  keys: readonly DiscoveryKey[],
): RuleEffect {
  if (keys.length === 0) return unchanged(state)
  const record = recordIdContacts(readSection(state, playerId, CODEX_SECTION), keys)
  if (record.events.length === 0) return unchanged(state)
  return {
    state: withSection(state, playerId, CODEX_SECTION, record.section),
    events: record.events,
  }
}

function oreTouchesOf(before: AuthorityState, heard: readonly DomainEvent[]): OreTouch[] {
  return heard.flatMap((event) => oreTouchOf(before, event))
}

function oreTouchOf(before: AuthorityState, event: DomainEvent): OreTouch[] {
  if (event.type === 'DrillDamageDealt') return touchesOf(oreTypeAtTile(before, event), 'drill')
  if (event.type === 'DrillGated') return touchesOf(oreNamed(event.oreId), 'gate')
  if (event.type === 'CargoAdded') return touchesOf(oreNamed(event.oreId), 'cargo')
  return []
}

/** A unit in the hold is mined; a drill or gate touch is contact only. */
function touchesOf(ore: OreType | null, via: ContactRoute): OreTouch[] {
  return ore === null ? [] : [{ ore, via, isMined: via === 'cargo' }]
}
