import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../../constants/physics'
import { enemyTier } from '../../economy/enemyStats'
import { gunRangeTiles } from '../../economy/gunStats'
import { hullMax, onCurveLevel } from '../../economy/vehicleStats'
import { toCanonical } from '../../money'
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import type { CommandIntent } from '../authorityCommand'
import { poseAt } from '../collapse/collapseFixtures'
import type { DomainEvent } from '../domainEvent'
import type { ScriptedSession } from '../scriptedSession'
import type { Enemy } from './combatState'
import { walkStepMmOf } from './enemyMovement'
import { digPlanet6Tunnel, PLANET_6, TUNNEL_FROM_X, TUNNEL_TO_X } from './wreckerFixtures'
import { stepOfMajor } from '../../economy/upgradeSteps'

/**
 * Auto guns against a fleeing tunnel wrecker (#126, Systems' flee-window check on #111): at
 * 1.0 to 1.5 tiles/s a level-1 gun finishes a wrecker the player stops beside, a vehicle that
 * drives past at full speed does not, and a head-on chase stays the drill's job.
 *
 * The wrecker gnaws a ring in the middle of the planet 6 tunnel, so it flees along open tunnel
 * and never reaches rock inside gun range. Its walking speed saturates with its tier, so the
 * cases borrow a planet's band-2 tier and the drill and hull on their curve there: planet 6 is the real
 * wrecker; planet 80's tier walks 24 mm a tick (1.44 tiles/s), the fastest step any tier takes,
 * because 1.5 tiles/s (25 mm a tick) is the limit the saturating curve never reaches; planet 1's
 * walks 16 mm a tick (0.96 tiles/s), the slowest.
 */
const SLOWEST = { name: 'slowest (16 mm/tick)', planet: 1, stepMm: 16 }
const PLANET_6_BAND_2 = { name: 'planet 6 band 2 (19 mm/tick)', planet: 6, stepMm: 19 }
const FASTEST = { name: 'fastest (24 mm/tick)', planet: 80, stepMm: 24 }
type WreckerCase = typeof FASTEST

/** 22 tiles behind the parked vehicle: past `ignoreVehicleTiles`, 18 tiles of tunnel beyond. */
const RING_TILES_BEHIND = 22
const GUN_RANGE_MM = gunRangeTiles() * MM_PER_METRE
/** How long a stopped vehicle waits: long past any kill or escape. */
const WATCH_TICKS = 20 * TICKS_PER_SECOND
/** The chasing drill keeps this far behind the wrecker: inside contact reach, on the nose. */
const CHASE_GAP_MM = 800

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

interface Pursuit {
  session: ScriptedSession
  tick: number
  x: number
  y: number
  /** Pose reports every this many ticks, as the shell sends them. */
  reportTicks: number
}

/** The P6 tunnel, guns at level 1, engine on curve, a wrecker of `wrecker`'s tier gnawing mid-tunnel. */
function wreckerGnawingMidTunnel(wrecker: WreckerCase, reportTicks = 12): Pursuit {
  const { session, tick } = digPlanet6Tunnel()
  armForTheChase(wrecker).forEach((intent) => session.submit(tick, intent))
  const pursuit = { session, tick: tick + 1, x: TUNNEL_TO_X, y: PLANET_6.y, reportTicks }
  return holdStill(pursuit, FACING.right, 6 * TICKS_PER_SECOND)
}

function armForTheChase(wrecker: WreckerCase): CommandIntent[] {
  const hullLevel = onCurveLevel('hull', wrecker.planet)
  return [
    { type: 'debug.clearEnemies', payload: {} },
    {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'engine', level: stepOfMajor(onCurveLevel('engine', 6)) },
    },
    {
      type: 'debug.setUpgrade',
      payload: {
        upgradeId: 'drill_power',
        level: stepOfMajor(onCurveLevel('drill_power', wrecker.planet)),
      },
    },
    { type: 'debug.setUpgrade', payload: { upgradeId: 'hull', level: stepOfMajor(hullLevel) } },
    { type: 'debug.setHull', payload: { hull: toCanonical(hullMax(hullLevel)) } },
    { type: 'debug.setGunLevel', payload: { level: stepOfMajor(1) } },
    {
      type: 'debug.spawnEnemy',
      payload: {
        kind: 'tunnel_wrecker',
        tier: enemyTier(wrecker.planet, 2),
        dx: -RING_TILES_BEHIND,
        dy: 0,
      },
    },
  ]
}

function wreckerOf(session: ScriptedSession): Enemy | undefined {
  return session.state().combat.enemies.find((enemy) => enemy.kind === 'tunnel_wrecker')
}

/** Millimetres the vehicle covers in one report at its top speed. */
function reportStepMm({ session, reportTicks }: Pursuit): number {
  const { speedMax } = statsOfVehicle(session.vehicle()).engine
  return Math.floor((speedMax * MM_PER_METRE * reportTicks) / TICKS_PER_SECOND)
}

function report(pursuit: Pursuit, x: number, facing: Facing, y = pursuit.y): Pursuit {
  const tick = pursuit.tick + pursuit.reportTicks
  pursuit.session.submit(tick, poseAt(x, y, 0, facing))
  return { ...pursuit, tick, x, y }
}

/** Left along the tunnel at top speed, never drilling, until the vehicle is at `toX`. */
function driveLeftTo(pursuit: Pursuit, toX: number): Pursuit {
  let driving = pursuit
  while (driving.x > toX) {
    driving = report(driving, Math.max(toX, driving.x - reportStepMm(driving)), FACING.left)
  }
  return driving
}

function holdStill(pursuit: Pursuit, facing: Facing, ticks: number): Pursuit {
  let holding = pursuit
  while (holding.tick < pursuit.tick + ticks) holding = report(holding, holding.x, facing)
  return holding
}

/** Stopped beside the gnawed ring with the drill turned down, the guns watching the tunnel. */
function stopBesideTheRing(wrecker: WreckerCase, reportTicks = 12) {
  const start = wreckerGnawingMidTunnel(wrecker, reportTicks)
  const before = eventsBefore(start)
  const ring = wreckerOf(start.session) as Enemy
  const farthestMm = farthestWhileWatched(driveLeftTo(start, ring.x), FACING.down)
  return { events: start.session.events().slice(before), farthestMm }
}

/** Holds still for `WATCH_TICKS`, answering the farthest the wrecker got while still there. */
function farthestWhileWatched(pursuit: Pursuit, facing: Facing): number {
  let watching = pursuit
  let farthestMm = 0
  while (watching.tick < pursuit.tick + WATCH_TICKS) {
    watching = report(watching, watching.x, facing)
    farthestMm = Math.max(farthestMm, distanceToWrecker(watching))
  }
  return farthestMm
}

function distanceToWrecker({ session, x, y }: Pursuit): number {
  const wrecker = wreckerOf(session)
  if (wrecker === undefined) return 0
  return Math.hypot(wrecker.x - x, wrecker.y - y)
}

/** Past the gnawed ring at top speed and on to the tunnel's start, never braking. */
function driveStraightPast(wrecker: WreckerCase) {
  const start = wreckerGnawingMidTunnel(wrecker)
  const before = eventsBefore(start)
  holdStill(driveLeftTo(start, TUNNEL_FROM_X + 2000), FACING.left, WATCH_TICKS)
  return start.session.events().slice(before)
}

/**
 * Head-on down the tunnel at top speed, steering at the wrecker's height inside the bore so it
 * stays dead ahead (it flees along a ray from the vehicle and drifts toward the wall), the drill
 * kept on its nose once it catches up.
 */
function chaseHeadOn(wrecker: WreckerCase) {
  let chasing = wreckerGnawingMidTunnel(wrecker)
  const before = eventsBefore(chasing)
  const giveUpTick = chasing.tick + WATCH_TICKS
  let lastX = TUNNEL_TO_X
  while (chasing.tick < giveUpTick && wreckerOf(chasing.session) !== undefined) {
    const fleeing = wreckerOf(chasing.session) as Enemy
    lastX = fleeing.x
    const toX = Math.max(lastX + CHASE_GAP_MM, chasing.x - reportStepMm(chasing))
    chasing = report(chasing, toX, FACING.left, fleeing.y)
  }
  return { events: chasing.session.events().slice(before), lastX }
}

function eventsBefore({ session }: Pursuit): number {
  return session.events().length
}

function shotsIn(events: readonly DomainEvent[]): number {
  return ofType(events, 'GunHit').reduce((total, hit) => total + hit.shots, 0)
}

function wreckerKillsIn(events: readonly DomainEvent[]) {
  return ofType(events, 'EnemyKilled').filter((kill) => kill.kind === 'tunnel_wrecker')
}

describe('tunnel wrecker against auto guns: the cases (#126)', () => {
  it.each([SLOWEST, PLANET_6_BAND_2, FASTEST])('walks the $name case at its step', (wrecker) => {
    const { session } = wreckerGnawingMidTunnel(wrecker)
    const gnawing = wreckerOf(session) as Enemy
    expect(gnawing.phase).toBe('gnaw')
    expect(walkStepMmOf(gnawing)).toBe(wrecker.stepMm)
  })
})

describe('tunnel wrecker against auto guns: stop and commit (#126 acceptance 2, 3)', () => {
  it.each([
    { wrecker: PLANET_6_BAND_2, reportTicks: 12 },
    { wrecker: FASTEST, reportTicks: 12 },
    { wrecker: FASTEST, reportTicks: 4 },
  ])(
    'kills the $wrecker.name wrecker with a level-1 gun before it gets 8 tiles from a vehicle stopped beside its ring, reporting every $reportTicks ticks',
    ({ wrecker, reportTicks }) => {
      const { events, farthestMm } = stopBesideTheRing(wrecker, reportTicks)
      expect(wreckerKillsIn(events)).toEqual([expect.objectContaining({ by: 'gun' })])
      expect(ofType(events, 'WreckerFled')).toEqual([])
      expect(ofType(events, 'EnemyDamaged')).toEqual([])
      expect(farthestMm).toBeLessThan(GUN_RANGE_MM)
    },
  )

  it.each([PLANET_6_BAND_2, FASTEST])(
    'lets the $name wrecker get away from a vehicle that drives straight past at top speed',
    (wrecker) => {
      const events = driveStraightPast(wrecker)
      expect(shotsIn(events)).toBeGreaterThan(0)
      expect(wreckerKillsIn(events)).toEqual([])
      expect(ofType(events, 'WreckerFled')).toHaveLength(1)
    },
  )
})

describe('tunnel wrecker against auto guns: head-on stays the drill (#126 acceptance 4, 5)', () => {
  it.each([SLOWEST, FASTEST])(
    'fires no gun shot at the $name wrecker fleeing head-on, and the drill kills it in the open tunnel',
    (wrecker) => {
      const { events, lastX } = chaseHeadOn(wrecker)
      expect(shotsIn(events)).toBe(0)
      expect(wreckerKillsIn(events)).toEqual([expect.objectContaining({ by: 'drill' })])
      expect(lastX).toBeGreaterThan(TUNNEL_FROM_X)
    },
  )
})
