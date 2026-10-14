import { describe, expect, expectTypeOf, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityState } from '../authority/authorityState'
import { CORRIDOR_MIDDLE, prepareCorridor, spawnEnemy } from '../authority/combat/combatFixtures'
import type { Enemy, EnemyPhase } from '../authority/combat/combatState'
import { walkStepMmOf } from '../authority/combat/enemyMovement'
import type { DomainEvent } from '../authority/domainEvent'
import { createScriptedSession, type ScriptedSession } from '../authority/scriptedSession'
import { FACING } from '../vehicle/vehiclePose'
import { ENEMY_FLUSH_CAP, flushTicksOf, type EnemyFlush } from './enemyFlushes'
import { RegistrationRefusedError } from './seal'

// Slices flush a burrower out of the rock into a near exposed face (ticket 386, K-flush; TD lock
// 6163443399 on #319); fake slices register through withRegistrations, so no real slice is imported.

type Answer = (enemy: Enemy, tick: number) => number | null

function flushSlice(id: string, answer: Answer): SliceDefinition {
  return {
    id,
    register: (r) =>
      r.enemyFlush({ id: `${id}.flush`, flushTicksOf: (enemy, _s, tick) => answer(enemy, tick) }),
  }
}

const flushingFor =
  (flushTicks: number): Answer =>
  () =>
    flushTicks

/** A tier 1 burrower 4 tiles behind the vehicle and 2 rows under the corridor floor. */
const BURROWER_OFFSET = { dx: 4, dy: -2 } as const
/** A walk of 90 tier 1 steps (25 mm) reaches the corridor cell 2 tiles above it; 60 does not. */
const NEAR_FLUSH_TICKS = 90
const SHORT_FLUSH_TICKS = 60
const FRAME_TICKS = 150

/** One burrower's phase and place at every tick of a run, with the run's world and events. */
interface Frame {
  tick: number
  phase: EnemyPhase
  x: number
  y: number
}

interface Run {
  start: number
  frames: Frame[]
  session: ScriptedSession
}

function burrowerRunWith(slices: readonly SliceDefinition[]): Run {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.left)
    session.submit(start, spawnEnemy('burrower', 1, BURROWER_OFFSET.dx, BURROWER_OFFSET.dy))
    return { start, frames: framesOf(session, start, start + FRAME_TICKS), session }
  })
}

function framesOf(session: ScriptedSession, from: number, to: number): Frame[] {
  const frames: Frame[] = []
  for (let tick = from; tick <= to; tick++) {
    session.advanceTo(tick)
    const enemy = session.state().combat.enemies.find(({ kind }) => kind === 'burrower')
    if (enemy !== undefined) frames.push({ tick, phase: enemy.phase, x: enemy.x, y: enemy.y })
  }
  return frames
}

/** Whether the frame stands in the corridor the fixture bored, by its row and columns. */
function isInCorridor({ x, y }: Frame): boolean {
  const tx = Math.floor(x / 1000)
  const ty = Math.floor(y / 1000)
  return ty === CORRIDOR_MIDDLE.ty && Math.abs(tx - CORRIDOR_MIDDLE.tx) <= 6
}

function firstOpenFrame(frames: readonly Frame[]): Frame {
  const frame = frames.find(isInCorridor)
  if (frame === undefined) throw new Error('the burrower never surfaced')
  return frame
}

function hitsOf(events: readonly DomainEvent[], from: number, to: number): DomainEvent[] {
  return events.filter(
    ({ type, tick }) =>
      (type === 'VehicleDamaged' || type === 'EnemyDamaged') && tick >= from && tick <= to,
  )
}

/** A real burrower and state to ask the fold with, under the corridor. */
function corridorBurrower(): { state: AuthorityState; enemy: Enemy } {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.left)
  session.submit(start, spawnEnemy('burrower', 1, BURROWER_OFFSET.dx, BURROWER_OFFSET.dy))
  return { state: session.state(), enemy: session.state().combat.enemies[0] }
}

function flushWith(slices: readonly SliceDefinition[]): number | null {
  return withRegistrations(slices, () => {
    const { state, enemy } = corridorBurrower()
    return flushTicksOf(state, enemy, 0)
  })
}

describe('enemy flushes: the fold', () => {
  it('answers no flush with nothing registered', () => {
    expect(flushWith([])).toBeNull()
  })

  it('answers no flush when every flush has no opinion', () => {
    expect(flushWith([flushSlice('quiet', () => null)])).toBeNull()
  })

  it('takes the strongest flush, the largest answer, never a sum', () => {
    const slices = [flushSlice('short', flushingFor(30)), flushSlice('long', flushingFor(90))]
    expect(flushWith(slices)).toBe(90)
  })

  it.each([
    ['zero ticks', 0],
    ['a negative count', -5],
    ['a fraction of a tick', 12.5],
  ])('throws when a provider answers %s', (_name, answer) => {
    expect(() => flushWith([flushSlice('bad', () => answer)])).toThrow(RangeError)
  })

  it('lets exactly the cap of flushes register and refuses one more at the seal', () => {
    const slicesOf = (count: number) =>
      Array.from({ length: count }, (_, at) => flushSlice(`flush-${at}`, flushingFor(30)))
    expect(flushWith(slicesOf(ENEMY_FLUSH_CAP))).toBe(30)
    expect(() => withRegistrations(slicesOf(ENEMY_FLUSH_CAP + 1), () => null)).toThrow(
      RegistrationRefusedError,
    )
  })

  it('takes the enemy, the state and the tick only', () => {
    expectTypeOf<Parameters<EnemyFlush['flushTicksOf']>>().toEqualTypeOf<
      [Enemy, AuthorityState, number]
    >()
  })
})

describe('enemy flushes: a burrower near an exposed face', () => {
  const plain = burrowerRunWith([])
  const flushed = burrowerRunWith([flushSlice('shell', flushingFor(NEAR_FLUSH_TICKS))])
  const surfaced = firstOpenFrame(flushed.frames)

  it('starts in the rock, two rows under the corridor', () => {
    expect(isInCorridor(flushed.frames[0])).toBe(false)
  })

  it('surfaces into the corridor within flushTicks', () => {
    expect(surfaced.tick - flushed.start).toBeLessThanOrEqual(NEAR_FLUSH_TICKS)
  })

  it('walks straight up to the nearest face, not at the vehicle, at its walking step', () => {
    const { enemy } = withRegistrations([], corridorBurrower)
    const climb = flushed.frames.filter(({ tick }) => tick <= surfaced.tick)
    expect(new Set(climb.map(({ x }) => x))).toEqual(new Set([flushed.frames[0].x]))
    expect(climb[1].y - climb[0].y).toBe(walkStepMmOf(enemy))
  })

  it('is still in the rock at that tick with nothing registered', () => {
    const atSurfacing = plain.frames.find(({ tick }) => tick === surfaced.tick)
    expect(atSurfacing === undefined || !isInCorridor(atSurfacing)).toBe(true)
  })

  it('cuts no cell and deals no hit while it surfaces', () => {
    expect(flushed.session.state().world).toEqual(plain.session.state().world)
    expect(hitsOf(flushed.session.events(), flushed.start, surfaced.tick)).toEqual([])
  })

  it('keeps to the open cells while the flush lasts, instead of diving back in', () => {
    const after = flushed.frames.filter(({ tick }) => tick >= surfaced.tick)
    expect(after.length).toBeGreaterThan(30)
    expect(after.filter((frame) => !isInCorridor(frame))).toEqual([])
  })
})

describe('enemy flushes: what a flush leaves alone', () => {
  it('lets a burrower whose face is out of flushTicks walking reach hunt as before in the rock', () => {
    const plain = burrowerRunWith([])
    const short = burrowerRunWith([flushSlice('shell', flushingFor(SHORT_FLUSH_TICKS))])
    const inRock = ({ tick }: Frame) => tick <= firstOpenFrame(plain.frames).tick
    expect(short.frames.filter(inRock)).toEqual(plain.frames.filter(inRock))
  })

  it('asks only about burrowers, never a crawler', () => {
    const asked = new Set<string>()
    const recording = flushSlice('shell', (enemy) => {
      asked.add(enemy.kind)
      return null
    })
    withRegistrations([recording], () => {
      const session = createScriptedSession()
      const start = prepareCorridor(session, FACING.left)
      session.submit(start, spawnEnemy('crawler', 1, 4))
      session.advanceTo(start + 60)
    })
    expect(asked).toEqual(new Set())
  })
})
