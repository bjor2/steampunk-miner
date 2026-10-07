/**
 * The enemy and hazard keys one step's events meet (ticket 252, S2 of the #157 gap review): an
 * enemy is contacted when it and the vehicle hurt each other (its hit on the vehicle, or the
 * drill, the guns or a charge on it), a hazard when it acts on the vehicle (a lava touch, or the
 * heat gauge rising past a line it watches).
 *
 * Only the tunnel wrecker is recorded for now, the one enemy a #161 node keys on. Crawler and
 * burrower contact runs through the committed goldens, so recording them moves their digests and
 * takes a protocol bump of its own. Hazard ids are the #161 key names: the economy's `heat`
 * archetype is the `heat_lava` Schedule C row; frozen, magnetic and hollow join here when their
 * planets have archetypes.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { enemyById } from '../../../systems/authority/combat/combatState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { EnemyKind } from '../../../systems/economy/economyDefinition'
import { hazardArchetypeOn } from '../../../systems/economy/heatEconomy'
import type { DiscoveryKey } from '../../../systems/registries/discovery'

const RECORDED_ENEMY_KINDS: readonly EnemyKind[] = ['tunnel_wrecker']

const HAZARD_ID_OF_ARCHETYPE: ReadonlyMap<string, string> = new Map([['heat', 'heat_lava']])

/** Every enemy and hazard key the events meet, in event order, repeats included. */
export function contactKeysOf(
  before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): DiscoveryKey[] {
  return heard.flatMap((event) => [
    ...enemyKeysOf(before, after, event),
    ...hazardKeysOf(before, event),
  ])
}

function enemyKeysOf(
  before: AuthorityState,
  after: AuthorityState,
  event: DomainEvent,
): DiscoveryKey[] {
  const kind = enemyKindTouchedBy(before, after, event)
  return kind !== null && RECORDED_ENEMY_KINDS.includes(kind) ? [`enemy:${kind}`] : []
}

/** The kind of the enemy the event says hurt the vehicle or was hurt by it; null for none. */
function enemyKindTouchedBy(
  before: AuthorityState,
  after: AuthorityState,
  event: DomainEvent,
): EnemyKind | null {
  if (event.type === 'VehicleDamaged' || event.type === 'EnemyKilled') return event.kind
  if (event.type === 'EnemyDamaged' || event.type === 'GunHit') {
    return kindOfEnemy(before, after, event.enemyId)
  }
  return null
}

/** Looked up after the step first, for one spawned in it, then before it, for one killed in it. */
function kindOfEnemy(
  before: AuthorityState,
  after: AuthorityState,
  enemyId: string,
): EnemyKind | null {
  const enemy = enemyById(after.combat, enemyId) ?? enemyById(before.combat, enemyId)
  return enemy?.kind ?? null
}

function hazardKeysOf(before: AuthorityState, event: DomainEvent): DiscoveryKey[] {
  if (event.type !== 'LavaTouched' && event.type !== 'HeatThreshold') return []
  const hazardId = hazardIdOn(before.planet.index)
  return hazardId === null ? [] : [`hazard:${hazardId}`]
}

/** The hazard key id of the planet's archetype; null off every act or for an unnamed one. */
function hazardIdOn(planetIndex: number): string | null {
  const archetype = hazardArchetypeOn(planetIndex)
  return archetype === null ? null : (HAZARD_ID_OF_ARCHETYPE.get(archetype.id) ?? null)
}
