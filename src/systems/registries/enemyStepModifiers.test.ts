import { describe, expect, expectTypeOf, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityState } from '../authority/authorityState'
import { prepareCorridor, spawnEnemy } from '../authority/combat/combatFixtures'
import type { Enemy, EnemyPhase } from '../authority/combat/combatState'
import { lungeStepMmOf, walkStepMmOf } from '../authority/combat/enemyMovement'
import { digPlanet6Tunnel } from '../authority/combat/wreckerFixtures'
import { createScriptedSession, type ScriptedSession } from '../authority/scriptedSession'
import { FACING } from '../vehicle/vehiclePose'
import {
  ENEMY_STEP_MODIFIER_CAP,
  modifiedEnemyStepMm,
  type EnemyStepModifier,
} from './enemyStepModifiers'
import { RegistrationRefusedError } from './seal'

// Slices slow an enemy's step, slow-only and the strongest wins (ticket 375, the TD lock on #263
// Q2); fake slices register through withRegistrations, so no real slice is imported.

type Answer = (step: number, tick: number) => number | null

function slowSlice(id: string, answer: Answer): SliceDefinition {
  return {
    id,
    register: (r) =>
      r.enemyStepModifier({ id: `${id}.slow`, modify: (step, _e, _s, tick) => answer(step, tick) }),
  }
}

const halving =
  (fromTick = 0): Answer =>
  (step, tick) =>
    tick >= fromTick ? Math.floor(step / 2) : null

/** One enemy's phase, place and fixed step at every tick of a run. */
interface Frame {
  tick: number
  phase: EnemyPhase
  x: number
  stepX: number
}

/**
 * A tier 1 crawler 6 tiles behind the vehicle in the corridor: approach, wind-up, lunge, a rear hit
 * and its recoil. Long enough for a halved walk to reach its first lunge.
 */
function crawlerFramesWith(slices: readonly SliceDefinition[]): Frame[] {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.left)
    session.submit(start, spawnEnemy('crawler', 1, 6))
    return framesOf(session, start, start + 240, 'crawler')
  })
}

/** The planet 6 wrecker breaching its first ring and seeking the next. */
function wreckerFramesWith(slices: readonly SliceDefinition[]): Frame[] {
  return withRegistrations(slices, () => {
    const { session, tick } = digPlanet6Tunnel()
    return framesOf(session, tick, tick + 300, 'tunnel_wrecker')
  })
}

function framesOf(session: ScriptedSession, from: number, to: number, kind: string): Frame[] {
  const frames: Frame[] = []
  for (let tick = from; tick <= to; tick++) {
    session.advanceTo(tick)
    const enemy = session.state().combat.enemies.find((each) => each.kind === kind)
    if (enemy !== undefined) frames.push({ tick, ...frameOf(enemy) })
  }
  return frames
}

function frameOf(enemy: Enemy): Omit<Frame, 'tick'> {
  return { phase: enemy.phase, x: enemy.x, stepX: enemy.step.x }
}

/** How far the enemy moved along x over each tick it stayed in `phase`. */
function walkedMmIn(frames: readonly Frame[], phase: EnemyPhase): number[] {
  return frames.flatMap((frame, at) =>
    isStillIn(frames, at, phase) ? [frame.x - frames[at - 1].x] : [],
  )
}

function isStillIn(frames: readonly Frame[], at: number, phase: EnemyPhase): boolean {
  return at > 0 && frames[at].phase === phase && frames[at - 1].phase === phase
}

/** The frames before the enemy first enters `phase`. */
function framesBefore(frames: readonly Frame[], phase: EnemyPhase): Frame[] {
  return frames.slice(0, frames.indexOf(firstFrameIn(frames, phase)))
}

function firstFrameIn(frames: readonly Frame[], phase: EnemyPhase): Frame {
  const frame = frames.find((each) => each.phase === phase)
  if (frame === undefined) throw new Error(`no ${phase} frame`)
  return frame
}

/** A real enemy and state to ask the fold with, a crawler in the corridor. */
function corridorCrawler(): { state: AuthorityState; enemy: Enemy } {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.left)
  session.submit(start, spawnEnemy('crawler', 1, 6))
  session.advanceTo(start + 1)
  return { state: session.state(), enemy: session.state().combat.enemies[0] }
}

function stepWith(slices: readonly SliceDefinition[], baseMm: number): number {
  return withRegistrations(slices, () => {
    const { state, enemy } = corridorCrawler()
    return modifiedEnemyStepMm(state, enemy, 0, baseMm)
  })
}

describe('enemy step modifiers: the fold', () => {
  it('answers the base step with nothing registered', () => {
    expect(stepWith([], 33)).toBe(33)
  })

  it('answers the base step when every modifier has no opinion', () => {
    expect(stepWith([slowSlice('quiet', () => null)], 33)).toBe(33)
  })

  it('takes the strongest slow, never their product or sum', () => {
    const slices = [slowSlice('half', halving()), slowSlice('third', (step) => step - 22)]
    expect(stepWith(slices, 33)).toBe(11)
  })

  it('asks every modifier in sorted-id order with the same base step', () => {
    const asked: string[] = []
    const recording = (id: string, answer: number): SliceDefinition =>
      slowSlice(id, (step) => {
        asked.push(`${id}:${step}`)
        return answer
      })
    expect(stepWith([recording('zeta', 20), recording('alpha', 25)], 33)).toBe(20)
    // The last two asks are the fold's; the set-up tick asked them too, for the crawler's walk.
    expect(asked.slice(-2)).toEqual(['alpha:33', 'zeta:33'])
  })

  it('lets a slow stop an enemy, answering zero', () => {
    expect(stepWith([slowSlice('stop', () => 0)], 33)).toBe(0)
  })
})

describe('enemy step modifiers: slow-only bounds', () => {
  it.each([
    ['a step longer than the base (a ratio above 1)', 34],
    ['a negative step', -1],
    ['a fraction of a millimetre', 16.5],
  ])('throws when a provider answers %s', (_name, answer) => {
    expect(() => stepWith([slowSlice('bad', () => answer)], 33)).toThrow(RangeError)
  })

  it('throws for the out-of-bounds provider even beside a lawful one', () => {
    const slices = [slowSlice('good', halving()), slowSlice('bad', () => 34)]
    expect(() => stepWith(slices, 33)).toThrow(/"bad\.slow"/)
  })

  it('lets exactly the cap of modifiers register', () => {
    const slices = Array.from({ length: ENEMY_STEP_MODIFIER_CAP }, (_, at) =>
      slowSlice(`slow-${at}`, halving()),
    )
    expect(stepWith(slices, 33)).toBe(16)
  })

  it('refuses at the seal one modifier more than the cap', () => {
    const slices = Array.from({ length: ENEMY_STEP_MODIFIER_CAP + 1 }, (_, at) =>
      slowSlice(`slow-${at}`, halving()),
    )
    expect(() => withRegistrations(slices, () => null)).toThrow(RegistrationRefusedError)
  })

  it('takes no vehicle motion: the step, the enemy, the state and the tick only', () => {
    expectTypeOf<Parameters<EnemyStepModifier['modify']>>().toEqualTypeOf<
      [number, Enemy, AuthorityState, number]
    >()
  })
})

describe('enemy step modifiers: hunters', () => {
  const plain = crawlerFramesWith([])
  const halved = crawlerFramesWith([slowSlice('half', halving())])
  const { enemy: crawler } = withRegistrations([], corridorCrawler)
  const walkMm = walkStepMmOf(crawler)
  const lungeMm = lungeStepMmOf(crawler)

  it('walks a crawler its whole step and lunges and recoils whole with nothing registered', () => {
    expect(new Set(walkedMmIn(framesBefore(plain, 'windup'), 'approach'))).toEqual(
      new Set([-walkMm]),
    )
    expect(firstFrameIn(plain, 'lunge').stepX).toBe(-lungeMm)
    expect(firstFrameIn(plain, 'recoil').stepX).toBe(walkMm)
  })

  it('halves a crawler walking step under a halving modifier', () => {
    expect(new Set(walkedMmIn(framesBefore(halved, 'windup'), 'approach'))).toEqual(
      new Set([-Math.floor(walkMm / 2)]),
    )
  })

  it('halves the lunge step chosen when the lunge starts', () => {
    expect(firstFrameIn(halved, 'lunge').stepX).toBe(-Math.floor(lungeMm / 2))
  })

  it('keeps the step of a lunge under way when the slow turns on, and halves the recoil after', () => {
    const lungeStart = firstFrameIn(plain, 'lunge').tick
    const lateSlow = crawlerFramesWith([slowSlice('half', halving(lungeStart + 1))])
    expect(lateSlow.filter(({ phase }) => phase === 'lunge')).toEqual(
      plain.filter(({ phase }) => phase === 'lunge'),
    )
    expect(firstFrameIn(lateSlow, 'recoil').stepX).toBe(Math.floor(walkMm / 2))
  })
})

describe('enemy step modifiers: the tunnel wrecker', () => {
  it('halves the wrecker seek step toward its next ring', () => {
    const plainSeek = walkedMmIn(wreckerFramesWith([]), 'seek').filter((dx) => dx !== 0)
    const halvedFrames = wreckerFramesWith([slowSlice('half', halving())])
    const halvedSeek = walkedMmIn(halvedFrames, 'seek').filter((dx) => dx !== 0)
    expect(plainSeek.length).toBeGreaterThan(0)
    const walkMm = plainSeek[0]
    expect(new Set(plainSeek)).toEqual(new Set([walkMm]))
    expect(new Set(halvedSeek)).toEqual(new Set([Math.floor(walkMm / 2)]))
  })

  it('halves the step of a wrecker fleeing the vehicle', () => {
    const fleeingWith = (slices: readonly SliceDefinition[]) =>
      withRegistrations(slices, () => {
        const session = createScriptedSession()
        const start = prepareCorridor(session, FACING.left)
        session.submit(start, spawnEnemy('tunnel_wrecker', 1, 6))
        return walkedMmIn(framesOf(session, start, start + 30, 'tunnel_wrecker'), 'flee')
      })
    const plainFlee = fleeingWith([])
    expect(new Set(fleeingWith([slowSlice('half', halving())]))).toEqual(
      new Set([Math.floor(plainFlee[0] / 2)]),
    )
  })
})
