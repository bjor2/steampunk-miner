import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import { FACING } from '../../vehicle/vehiclePose'
import { advanceTicks } from '../advanceTicks'
import { digAlong, parkAt, poseAt } from '../collapse/collapseFixtures'
import type { DomainEvent } from '../domainEvent'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import type { ScriptedSession } from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import { spawnEnemy } from './combatFixtures'
import {
  digPlanet6Tunnel,
  onPlanet,
  PLANET_5,
  PLANET_6,
  TUNNEL_FROM_X,
  TUNNEL_TO_X,
} from './wreckerFixtures'
import { routeOf } from './wreckerRoute'
import { wreckerCapOf, wreckersOwnedBy } from './wreckerSpawn'

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

const { gnawTicksPerRing, ignoreVehicleTiles, minLinedRings, respawnTicks } =
  ECONOMY.enemies.tunnelWrecker
const { despawnTiles, maxActivePerVehicle } = ECONOMY.enemies.combat

const FROM_X = TUNNEL_FROM_X
const TO_X = TUNNEL_TO_X

const ringX = (ring: string) => Number.parseInt(ring.split(',')[0], 10)

/** A full regular cap of crawlers 20 tiles down in the rock: out of sight, idle, never strays. */
const fillCapWithCrawlers = (session: ScriptedSession, tick: number) =>
  Array.from({ length: maxActivePerVehicle }, (_, at) =>
    session.submit(tick, spawnEnemy('crawler', 1, 20 + at, -20)),
  ).flat()

const crawlersOf = (session: ScriptedSession) =>
  session.state().combat.enemies.filter(({ kind }) => kind === 'crawler')

/** Where `digAlong` from tick 1 had the vehicle at `tick`: 100 mm every 12 ticks. */
const digXAt = (tick: number) => FROM_X + Math.floor((tick - 1) / 12) * 100

describe('tunnel wrecker: when one comes (#111 Spawn)', () => {
  it('comes to the newest ring more than 20 tiles behind once 20 rings are lined', () => {
    const { session } = digPlanet6Tunnel()
    const [spawned] = ofType(session.events(), 'WreckerSpawned')
    expect(spawned).toMatchObject({ band: 2 })
    const ringsBefore = ofType(session.events(), 'CasingPlaced').filter(
      (event) => event.tick <= spawned.tick,
    )
    expect(ringsBefore.length).toBeGreaterThanOrEqual(minLinedRings)
    const behind = digXAt(spawned.tick) - ringX(spawned.ring)
    expect(behind).toBeGreaterThanOrEqual(ignoreVehicleTiles * MM_PER_METRE)
    expect(behind).toBeLessThan((ignoreVehicleTiles + 2) * MM_PER_METRE)
    const enemy = ofType(session.events(), 'EnemySpawned').find(
      ({ enemyId }) => enemyId === spawned.enemyId,
    )
    expect(enemy).toMatchObject({ kind: 'tunnel_wrecker', spawnPointId: 'route' })
    expect(ofType(session.events(), 'EnemyTypeEncountered').map(({ kind }) => kind)).toContain(
      'tunnel_wrecker',
    )
  })

  it('never comes before 20 rings are lined behind the vehicle', () => {
    const session = onPlanet(PLANET_6.planetIndex)
    const shortEnd = FROM_X + (minLinedRings - 6) * 500
    const dug = digAlong(session, 1, PLANET_6.y, FROM_X, shortEnd)
    parkAt(session, dug, dug + 2400, shortEnd, PLANET_6.y, 10)
    expect(routeOf(session.state().combat, 'p1').rings.length).toBeLessThan(minLinedRings)
    expect(ofType(session.events(), 'WreckerSpawned')).toEqual([])
  })

  it('never comes, and remembers no route, on a planet before 6', () => {
    const session = onPlanet(PLANET_5.planetIndex)
    const dug = digAlong(session, 1, PLANET_5.y, FROM_X, TO_X)
    parkAt(session, dug, dug + 2400, TO_X, PLANET_5.y, 10)
    expect(ofType(session.events(), 'CasingPlaced').length).toBeGreaterThan(minLinedRings)
    expect(session.state().combat.routes).toEqual({})
    expect(ofType(session.events(), 'WreckerSpawned')).toEqual([])
  })

  it('never calls a wrecker to a ring beyond 48 tiles of its vehicle, where it would leave at once (#132)', () => {
    const { session, tick } = digPlanet6Tunnel()
    const farX = TO_X + (despawnTiles + 12) * MM_PER_METRE
    const before = session.events().length
    parkAt(session, tick, tick + 600, farX, PLANET_6.y, 10)
    const events = session.events().slice(before)
    expect(session.state().players.p1.vehicle.pose?.x).toBe(farX)
    expect(routeOf(session.state().combat, 'p1').rings.length).toBeGreaterThan(minLinedRings)
    expect(ofType(events, 'WreckerSpawned')).toEqual([])
  })

  it('keeps every wrecker longer than a tick unless it fled or died, and never recalls one to the ring it just left (#132)', () => {
    const { session, tick } = digPlanet6Tunnel()
    parkAt(session, tick, tick + 600, TO_X + (despawnTiles + 12) * MM_PER_METRE, PLANET_6.y, 10)
    const events = session.events()
    const spawned = ofType(events, 'WreckerSpawned')
    const gone = new Set([
      ...ofType(events, 'WreckerFled').map(({ enemyId }) => enemyId),
      ...ofType(events, 'EnemyKilled').map(({ enemyId }) => enemyId),
    ])
    const lives = spawned
      .filter(({ enemyId }) => !gone.has(enemyId))
      .map(({ enemyId, tick: from }) => {
        const left = ofType(events, 'EnemyDespawned').find((event) => event.enemyId === enemyId)
        return (left?.tick ?? session.state().tick) - from
      })
    expect(spawned.length).toBeGreaterThan(0)
    expect(lives.every((life) => life > 1)).toBe(true)
    const recalled = spawned
      .slice(1)
      .filter((event, at) => event.ring === spawned[at].ring && event.tick - spawned[at].tick <= 1)
    expect(recalled).toEqual([])
  })

  it('still comes to a vehicle whose regular enemy cap is full of crawlers (#131)', () => {
    const session = onPlanet(PLANET_6.planetIndex)
    session.submit(1, poseAt(FROM_X, PLANET_6.y))
    fillCapWithCrawlers(session, 1)
    digAlong(session, 2, PLANET_6.y, FROM_X, TO_X)
    expect(crawlersOf(session)).toHaveLength(maxActivePerVehicle)
    expect(ofType(session.events(), 'WreckerSpawned').length).toBeGreaterThan(0)
  })

  it('leaves the whole regular enemy cap to crawlers while a wrecker hunts (#131)', () => {
    const { session, tick } = digPlanet6Tunnel()
    expect(wreckersOwnedBy(session.state().combat, 'p1')).toBe(1)
    const answers = fillCapWithCrawlers(session, tick)
    expect(ofType(answers, 'CommandRejected')).toEqual([])
    expect(crawlersOf(session)).toHaveLength(maxActivePerVehicle)
  })

  it('lets one wrecker hunt a route from planet 6 and two from planet 10', () => {
    expect([5, 6, 9, 10, 40].map(wreckerCapOf)).toEqual([0, 1, 1, 2, 2])
  })

  it('forgets the route when the trip ends at a dock', () => {
    const { session, tick } = digPlanet6Tunnel()
    expect(routeOf(session.state().combat, 'p1').rings.length).toBeGreaterThan(minLinedRings)
    session.submit(tick, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    expect(session.state().combat.routes).toEqual({})
    expect(session.state().combat.enemies).toEqual([])
  })
})

describe('tunnel wrecker: gnawing (#111 Behaviour)', () => {
  it('breaches one ring every 300 ticks while the vehicle stays away', () => {
    const { session, tick } = digPlanet6Tunnel()
    parkAt(session, tick, tick + 3600, TO_X, PLANET_6.y, 10)
    const gnawed = ofType(session.events(), 'RingGnawed')
    expect(gnawed.length).toBeGreaterThanOrEqual(8)
    const gaps = gnawed.slice(1).map((event, at) => event.tick - gnawed[at].tick)
    expect(gaps.every((gap) => gap >= gnawTicksPerRing)).toBe(true)
    expect(gnawed.every(({ band }) => band === 2)).toBe(true)
    const breaches = ofType(session.events(), 'CasingBreached')
    expect(breaches.every(({ enemyId }) => enemyId !== null)).toBe(true)
  })

  it('never gnaws a ring within 20 tiles of a vehicle', () => {
    const { session, tick } = digPlanet6Tunnel()
    parkAt(session, tick, tick + 3600, TO_X, PLANET_6.y, 10)
    const gnawed = ofType(session.events(), 'RingGnawed')
    expect(gnawed.length).toBeGreaterThan(0)
    const reach = ignoreVehicleTiles * MM_PER_METRE
    expect(gnawed.every(({ ring }) => TO_X - ringX(ring) > reach)).toBe(true)
  })

  it('leaves a breached stretch that warns once the vehicle comes back within 16 m', () => {
    const { session, tick } = digPlanet6Tunnel()
    const parked = parkAt(session, tick, tick + 1800, TO_X, PLANET_6.y, 10)
    const firstRing = ringX(ofType(session.events(), 'RingGnawed')[0].ring)
    const before = session.events().length
    let at = parked
    for (let x = TO_X; x >= firstRing + 10000; x -= 500) {
      session.submit(at++, poseAt(x, PLANET_6.y, 0, FACING.left))
    }
    const warned = ofType(session.events().slice(before), 'CollapseWarned')
    expect(warned.length).toBeGreaterThan(0)
    expect(warned.every(({ weakestGrade, band }) => weakestGrade === 0 && band === 2)).toBe(true)
  })
})

describe('tunnel wrecker: fleeing and dying (#111 Behaviour, Systems numbers)', () => {
  it('flees a vehicle that comes within 12 tiles, logs wrecker_fled out of sight, and the next comes 3600 ticks later', () => {
    const { session, tick } = digPlanet6Tunnel()
    const parked = parkAt(session, tick, tick + 900, TO_X, PLANET_6.y, 10)
    const wrecker = session.state().combat.enemies.find((enemy) => enemy.kind === 'tunnel_wrecker')!
    let at = parked
    for (let x = TO_X; x >= wrecker.x + 6000; x -= 500) {
      session.submit(at++, poseAt(x, PLANET_6.y, 0, FACING.left))
    }
    const chaseEnd = parkAt(session, at, at + 1200, wrecker.x + 6000, PLANET_6.y, 10)
    const [fled] = ofType(session.events(), 'WreckerFled')
    expect(fled).toMatchObject({ enemyId: wrecker.id })
    expect(session.state().combat.enemies.map(({ id }) => id)).not.toContain(wrecker.id)
    const away = parkAt(session, chaseEnd, fled.tick + respawnTicks + 600, TO_X, PLANET_6.y, 10)
    const later = ofType(session.events(), 'WreckerSpawned').filter(
      (event) => event.tick > fled.tick,
    )
    expect(away).toBeGreaterThan(fled.tick + respawnTicks)
    expect(later.length).toBeGreaterThan(0)
    expect(later.every((event) => event.tick >= fled.tick + respawnTicks)).toBe(true)
  })

  it('dies on the drill as enemy_killed {kind: tunnel_wrecker, by: drill}, and the next comes 3600 ticks later', () => {
    const session = onPlanet(PLANET_6.planetIndex)
    const dug = digAlong(session, 1, PLANET_6.y, FROM_X, FROM_X + 3000)
    session.submit(dug, {
      type: 'debug.spawnEnemy',
      payload: { kind: 'tunnel_wrecker', tier: 31, dx: 0, dy: 0 },
    })
    parkAt(session, dug + 1, dug + 1200, FROM_X + 3000, PLANET_6.y, 10)
    const [killed] = ofType(session.events(), 'EnemyKilled')
    expect(killed).toMatchObject({ kind: 'tunnel_wrecker', by: 'drill' })
    expect(routeOf(session.state().combat, 'p1').nextWreckerTick).toBe(killed.tick + respawnTicks)
  })
})

describe('tunnel wrecker: determinism and snapshots (#111, #94 acceptance 7)', () => {
  it('gives the same events and digest whatever the clock batches, fixed step and 1 s jumps', () => {
    const { session, tick } = digPlanet6Tunnel()
    const start = session.state()
    const fine = { state: start, events: [] as DomainEvent[] }
    for (let at = tick + 1; at <= tick + 2400; at++) {
      const step = advanceTicks(fine.state, at)
      fine.state = step.state
      fine.events.push(...step.events)
    }
    const coarse = { state: start, events: [] as DomainEvent[] }
    for (let at = tick + 60; at <= tick + 2400; at += 60) {
      const step = advanceTicks(coarse.state, at)
      coarse.state = step.state
      coarse.events.push(...step.events)
    }
    expect(coarse.events).toEqual(fine.events)
    expect(stateDigest(coarse.state)).toBe(stateDigest(fine.state))
  })

  it('restores a session mid-gnaw from its snapshot and gnaws on to the same digest', () => {
    const { session, tick } = digPlanet6Tunnel()
    parkAt(session, tick, tick + 600, TO_X, PLANET_6.y, 10)
    const reading = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect(reading.problems).toEqual([])
    if (!('state' in reading)) return
    expect(reading.state.combat.enemies.some(({ phase }) => phase === 'gnaw')).toBe(true)
    const restored = advanceTicks(reading.state, tick + 1800)
    const uninterrupted = advanceTicks(session.state(), tick + 1800)
    expect(stateDigest(restored.state)).toBe(stateDigest(uninterrupted.state))
  })
})
