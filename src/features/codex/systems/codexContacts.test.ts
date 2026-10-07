import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import {
  createAuthorityState,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import {
  CORRIDOR_MIDDLE,
  poseAt,
  prepareCorridor,
  setPlanet,
  spawnEnemy,
} from '../../../systems/authority/combat/combatFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  AGAINST_LAVA,
  carveHole,
  HEAT_PLANET,
  reportAt,
} from '../../../systems/authority/lava/lavaFixtures'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { heatArchetype } from '../../../systems/economy/heatEconomy'
import { hasDiscovered, type DiscoveryKey } from '../../../systems/registries/discovery'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { slice as CODEX } from '../register'
import { progressTo } from './codexSpecs'
import { codexOf } from './codexReads'
import { CODEX_DISCOVERY_REACTION } from './codexReaction'

// The codex records an enemy on contact and a hazard on exposure (ticket 252, S2 of the #157 gap
// review), so the nodes keyed on them open at their tier instead of a planet later.

const WRECKER: DiscoveryKey = 'enemy:tunnel_wrecker'
const HEAT_LAVA: DiscoveryKey = 'hazard:heat_lava'

/** The kernel fallback would say "discovered": only the section can make the answer false. */
const REACHED_PLANET = { progress: progressTo(40), unlockPlanetIndex: 1 }

const codexEventsOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type.startsWith('codex.'))

const ask = (state: AuthorityState, key: DiscoveryKey) =>
  withRegistrations([CODEX], () => hasDiscovered(state, 'p1', key, REACHED_PLANET))

/** The planet 1 corridor with a tier 1 enemy of `kind` on the drill's nose; the fight's start tick. */
function enemyOnTheNose(session: ScriptedSession, kind: string): number {
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, spawnEnemy(kind, 1, 1))
  return start
}

/** A tunnel wrecker drilled on planet 1, then a lava touch on planet 8, each met twice. */
function wreckerThenLava(): ScriptedSession {
  const session = createScriptedSession()
  const start = enemyOnTheNose(session, 'tunnel_wrecker')
  session.advanceTo(start + 100)
  session.submit(start + 101, spawnEnemy('tunnel_wrecker', 1, 1))
  session.advanceTo(start + 200)
  const onHeat = start + 201
  session.submit(onHeat, setPlanet(HEAT_PLANET))
  session.submit(onHeat, carveHole)
  session.submit(onHeat + 1, reportAt(AGAINST_LAVA))
  session.submit(onHeat + 40, reportAt(AGAINST_LAVA))
  return session
}

describe('codex: enemy and hazard contact (ticket 252)', () => {
  it('records the tunnel wrecker and heat_lava once each, and the discovery query answers from them', () => {
    const { events, state } = withRegistrations([CODEX], () => {
      const session = wreckerThenLava()
      return { events: session.events(), state: session.state() }
    })
    const entries = codexEventsOf(events)
    expect(entries).toEqual([
      expect.objectContaining({ type: 'codex.EntryAdded', key: WRECKER, stage: 'contacted' }),
      expect.objectContaining({ type: 'codex.EntryAdded', key: HEAT_LAVA, stage: 'contacted' }),
    ])
    expect(entries.every((event) => event.playerId === 'p1')).toBe(true)
    expect(withRegistrations([CODEX], () => codexOf(state, 'p1'))).toMatchObject({
      enemy: { contacted: ['tunnel_wrecker'] },
      hazard: { contacted: ['heat_lava'] },
    })
    expect(ask(state, WRECKER)).toBe(true)
    expect(ask(state, HEAT_LAVA)).toBe(true)
  })

  it('answers neither key for a player who met neither', () => {
    const untouched = createAuthorityState({ planetIndex: 8, planetSeed: 83921, playerIds: ['p1'] })
    expect(ask(untouched, WRECKER)).toBe(false)
    expect(ask(untouched, HEAT_LAVA)).toBe(false)
  })

  it('records the wrecker in the answer whose events first touched it, stamped like them', () => {
    const events = withRegistrations([CODEX], () => {
      const session = createScriptedSession()
      session.advanceTo(enemyOnTheNose(session, 'tunnel_wrecker') + 100)
      return session.events()
    })
    const [entry] = codexEventsOf(events)
    const firstTouch = events.find((event) => event.type === 'EnemyDamaged')
    expect([entry.playerId, entry.tick, entry.seq]).toEqual([
      'p1',
      firstTouch?.tick,
      firstTouch?.seq,
    ])
  })

  it('records no crawler: only the tunnel wrecker is a key for now', () => {
    const { events, state } = withRegistrations([CODEX], () => {
      const session = createScriptedSession()
      const start = prepareCorridor(session, FACING.up)
      session.submit(start, spawnEnemy('crawler', 1, 3))
      session.advanceTo(start + 80)
      session.submit(start + 81, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
      session.submit(start + 81, spawnEnemy('crawler', 1, 1))
      session.advanceTo(start + 200)
      return { events: session.events(), state: session.state() }
    })
    const types = events.map((event) => event.type)
    expect(types).toContain('VehicleDamaged')
    expect(types).toContain('EnemyDamaged')
    expect(codexEventsOf(events)).toEqual([])
    expect(ask(state, 'enemy:crawler')).toBe(false)
  })

  it('counts the heat gauge rising past a line as heat_lava exposure', () => {
    const state = withRegistrations([CODEX], () => {
      const onHeat = createAuthorityState({
        planetIndex: HEAT_PLANET,
        planetSeed: 83921,
        playerIds: ['p1'],
      })
      const risen: DomainEvent = {
        playerId: 'p1',
        tick: 10,
        seq: 1,
        type: 'HeatThreshold',
        level: heatArchetype().throttleAt,
      }
      return CODEX_DISCOVERY_REACTION.react(onHeat, onHeat, [risen]).state
    })
    expect(ask(state, HEAT_LAVA)).toBe(true)
  })

  it('keeps both keys through a snapshot', () => {
    const state = withRegistrations([CODEX], () => wreckerThenLava().state())
    const restored = withRegistrations([CODEX], () =>
      readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(state)))),
    )
    if (!('state' in restored)) throw new Error(JSON.stringify(restored))
    expect(ask(restored.state, WRECKER)).toBe(true)
    expect(ask(restored.state, HEAT_LAVA)).toBe(true)
  })
})
