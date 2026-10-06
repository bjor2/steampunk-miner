import { describe, expect, it } from 'vitest'
import { projectDomainEvent } from '../../../logging/domainEventLog'
import { RUN_EVENT_REGISTRY } from '../../../logging/eventNames'
import { toCanonical } from '../../money'
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import { advanceTicks } from '../advanceTicks'
import { applyCommand, type CommandOutcome } from '../applyCommand'
import type { CommandIntent } from '../authorityCommand'
import { createAuthorityState } from '../authorityState'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, drill, WORLD_SEED, type ScriptedSession } from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import {
  CORRIDOR_MIDDLE,
  CORRIDOR_ROW,
  corridorCommands,
  poseAt,
  prepareCorridor,
  setHull,
  setUpgrade,
  spawnEnemy,
  type TimedCommand,
} from './combatFixtures'

/** Level-0 boiler: 150 units of 240 quanta (#6, #11 amendment 2). */
const FULL_TANK_QUANTA = 150 * 240

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

function advanceUntil(session: ScriptedSession, isDone: () => boolean, limit = 400): void {
  const end = session.state().tick + limit
  for (let tick = session.state().tick + 1; !isDone() && tick <= end; tick++)
    session.advanceTo(tick)
}

describe('combat: the latency rule (#9, #25 acceptance 5)', () => {
  /** A burrower lunging from below-right, 34 degrees off a right-facing drill. */
  function lungeFromBelowRight(reportFacingRightFirst: boolean) {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, spawnEnemy('burrower', 1, 3, -2))
    advanceUntil(session, () => session.state().combat.enemies[0]?.phase === 'lunge')
    const lungeStart = session.state().tick
    if (reportFacingRightFirst) {
      session.submit(lungeStart + 2, poseAt(CORRIDOR_MIDDLE, { facing: FACING.right }))
    }
    session.submit(lungeStart + 8, poseAt(CORRIDOR_MIDDLE, { facing: FACING.up }))
    advanceUntil(session, () => ofType(session.events(), 'VehicleDamaged').length > 0)
    return ofType(session.events(), 'VehicleDamaged')[0]
  }

  it('counts a hit as front when the report before the latest had the enemy in front', () => {
    expect(lungeFromBelowRight(true).arc).toBe('front')
  })

  it('takes the latest facing when no recent report had the enemy in front', () => {
    expect(lungeFromBelowRight(false).arc).toBe('side')
  })
})

/**
 * A scripted fight in the corridor: crawlers come from the right and the left in turn, and the
 * player turns the drill toward whichever one starts winding up. Poses go out every
 * `reportEvery` ticks. Returns every command sent, so a replay can send them again.
 */
function scriptedFight(reportEvery: number) {
  const session = createScriptedSession()
  const sent: TimedCommand[] = corridorCommands(FACING.right)
  const send = (tick: number, intent: CommandIntent) => {
    sent.push({ tick, intent })
    session.submit(tick, intent)
  }
  for (const { tick, intent } of sent) session.submit(tick, intent)
  const start = sent[sent.length - 1].tick
  send(start, setUpgrade('hull', 40))
  send(start, setHull('1000'))
  let facing: Facing = FACING.right
  for (let tick = start + 1; tick <= start + 1200; tick++) {
    if ((tick - start) % 200 === 1)
      send(tick, spawnEnemy('crawler', 3, (tick - start) % 400 === 1 ? 4 : -4))
    session.advanceTo(tick)
    facing = facingTowardWindUp(session, facing)
    if ((tick - start) % reportEvery === 0) send(tick, poseAt(CORRIDOR_MIDDLE, { facing }))
  }
  return { session, sent }
}

function facingTowardWindUp(session: ScriptedSession, current: Facing): Facing {
  const threat = session.state().combat.enemies.find((enemy) => enemy.phase === 'windup')
  if (threat === undefined) return current
  return threat.x > CORRIDOR_MIDDLE.tx * 1000 + 500 ? FACING.right : FACING.left
}

/** The ticks at which a reported facing differs from the report before it. */
function reportedFacingChanges(sent: readonly TimedCommand[]): number[] {
  const reports = sent.filter(({ intent }) => intent.type === 'reportPose')
  return reports
    .filter(
      (report, index) =>
        index > 0 && facingOf(reports[index - 1].intent) !== facingOf(report.intent),
    )
    .map((report) => report.tick)
}

function facingOf(intent: CommandIntent): number {
  return intent.type === 'reportPose' ? intent.payload.facing : -1
}

describe('combat: a scripted fight at two report rates (#25 acceptance 5)', () => {
  it.each([1, 12])(
    'keeps every hit front when the player faces each wind-up, reporting every %i ticks',
    (reportEvery) => {
      const { session, sent } = scriptedFight(reportEvery)
      const hits = ofType(session.events(), 'VehicleDamaged')
      const changes = reportedFacingChanges(sent)
      const nearChange = hits.filter((hit) =>
        changes.some((tick) => Math.abs(hit.tick - tick) <= 1),
      )
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.every((hit) => hit.arc === 'front')).toBe(true)
      expect(nearChange.length / hits.length).toBeLessThan(0.02)
      expect(ofType(session.events(), 'EnemyKilled').length).toBeGreaterThan(0)
    },
  )
})

describe('combat: determinism (#25 acceptance 12)', () => {
  /** Replays the commands with the clock moved once per rendered frame at `fps`. */
  function replayAtFps(commands: readonly TimedCommand[], endTick: number, fps: number) {
    let outcome: CommandOutcome = {
      state: createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
      events: [],
    }
    const keep = (step: CommandOutcome) => {
      outcome = { state: step.state, events: [...outcome.events, ...step.events] }
    }
    let next = 0
    for (let frame = 1; Math.floor((frame * 60) / fps) <= endTick + 1; frame++) {
      const frameTick = Math.min(endTick, Math.floor((frame * 60) / fps))
      for (; next < commands.length && commands[next].tick <= frameTick; next++) {
        const { tick, intent } = commands[next]
        keep(applyCommand(outcome.state, { playerId: 'p1', tick, seq: next + 1, ...intent }))
      }
      keep(advanceTicks(outcome.state, frameTick))
      if (frameTick === endTick) break
    }
    return outcome
  }

  it('gives the same digest and events at 30 and 144 rendered frames a second', () => {
    const { session, sent } = scriptedFight(12)
    const endTick = session.state().tick
    const at30 = replayAtFps(sent, endTick, 30)
    const at144 = replayAtFps(sent, endTick, 144)
    expect(stateDigest(at30.state)).toBe(stateDigest(session.state()))
    expect(stateDigest(at144.state)).toBe(stateDigest(at30.state))
    expect(at144.events).toEqual(at30.events)
    expect(ofType(at30.events, 'VehicleDamaged').length).toBeGreaterThan(0)
  })
})

describe('combat: the events it logs (#25 acceptance 9)', () => {
  const ALLOWED = [
    'enemy_spawned',
    'enemy_damaged',
    'enemy_killed',
    'enemy_type_encountered',
    'enemy_despawned',
    'vehicle_damaged',
    'vehicle_destroyed',
  ]

  it('logs only the registered combat names, and never player_killed', () => {
    const { session } = scriptedFight(12)
    const names = session
      .events()
      .map(projectDomainEvent)
      .flatMap((projected) => (projected === null ? [] : [projected.line.event]))
    const combatNames = names.filter(
      (name) =>
        RUN_EVENT_REGISTRY[name].group === 'vehicle_and_combat' &&
        !['vehicle_state_changed', 'vehicle_configuration_changed'].includes(name),
    )
    expect(new Set(combatNames)).toEqual(
      new Set(combatNames.filter((name) => ALLOWED.includes(name))),
    )
    expect(names).not.toContain('player_killed')
    expect(combatNames).toEqual(
      expect.arrayContaining(['enemy_spawned', 'enemy_killed', 'vehicle_damaged']),
    )
  })
})

describe('combat: death and no interruption (#25 acceptance 10, #23 item 4)', () => {
  it('logs vehicle_damaged, vehicle_destroyed and rescue_triggered in order after a rear hit on 1 hull', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.left)
    session.submit(start, setHull('1'))
    session.submit(start, spawnEnemy('crawler', 1, 3))
    session.advanceTo(start + 300)
    const order = session
      .events()
      .filter((event) =>
        ['VehicleDamaged', 'VehicleDestroyed', 'RescueTriggered'].includes(event.type),
      )
    expect(order.map((event) => event.type)).toEqual([
      'VehicleDamaged',
      'VehicleDestroyed',
      'RescueTriggered',
    ])
    expect(order[1]).toMatchObject({
      cause: 'enemy',
      attacker: { kind: 'crawler', tier: 1, arc: 'rear' },
    })
    expect(order[2]).toMatchObject({ cause: 'destroyed' })
    expect(session.vehicle().mode).toBe('docked')
    expect(toCanonical(session.vehicle().hull)).toBe('1.2544e+2')
    expect(session.vehicle().energy).toBeGreaterThanOrEqual(FULL_TANK_QUANTA / 4)
    expect(session.state().combat.enemies).toEqual([])
  })

  it('never refuses a mining command because of combat, and holds no pause or modal state', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, setUpgrade('hull', 40))
    session.submit(start, setHull('1000'))
    session.submit(start, spawnEnemy('crawler', 2, -4))
    session.submit(start, spawnEnemy('crawler', 2, 4))
    const end = { tx: CORRIDOR_MIDDLE.tx + 6, ty: CORRIDOR_ROW }
    let tick = start + 1
    for (let dx = 1; dx <= 5; dx++) {
      const tile = { tx: end.tx + dx, ty: CORRIDOR_ROW }
      session.submit(tick, poseAt({ tx: tile.tx - 1, ty: CORRIDOR_ROW }, { facing: FACING.right }))
      session.submit(tick + 40, drill(tile, 40))
      tick += 41
    }
    expect(ofType(session.events(), 'CommandRejected')).toEqual([])
    expect(ofType(session.events(), 'TileDestroyed').length).toBeGreaterThan(13)
    expect(Object.keys(session.state()).sort()).toEqual(
      [
        'collapse',
        'combat',
        'core',
        'debugApplied',
        'lava',
        'planet',
        'platform',
        'players',
        'tick',
        'world',
      ].sort(),
    )
    expect(Object.keys(session.state().combat).sort()).toEqual(
      [
        'encounteredKinds',
        'enemies',
        'isFrozen',
        'nextEnemyNumber',
        'routes',
        'usedSpawnPointIds',
        'vehicles',
      ].sort(),
    )
  })
})
