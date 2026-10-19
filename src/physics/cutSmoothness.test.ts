import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { createRig, type TickRead } from './cutFollowFixtures'

// Continuous cut-follow (K-bound, ticket 400, from the #397 TD lock): once a cut has ramped up the
// body holds the drill's speed across cell boundaries, its speed varying by at most 5% there, and
// it never ends a tick inside solid ground. The fixed step runs under render frames at 30 and at
// 144 frames a second, which must step the rig the same.
//
// With no tile floor (ticket 397) the fast rigs are named by their cut speed on planet 1 (GD and TD
// rulings on #397, Q2). The carry used to hold its target cell out of the stamp, a lip at the
// body's lower front; since ticket 421 the stamp carves that cell once it lies in the body's next
// step, and the walk pays it on the tick it meets it (rule (b), GD 6204353563, TD 6204362873). So
// the rigs hold the 5% line across cell boundaries, and the GD's interim bar for #421 (#397 keeps
// the strict 5% on every tick): judged on every ramped-up cut tick against the rig's own commanded
// cut speed, no tick goes backwards (below -0.02 m/s, as a stalled tick jitters at +-0.01) or under
// 80% of it, and at most 2% of the leg's ticks are more than 5% off it. An up cut, where the lifting
// stamp held the next cell out until the body's front arrived (ticket 432), now holds #397's strict
// line: every ramped-up cut tick within 5% of the rig's cut speed.
//
// Each rig is held on the legs where the carry was the cause. Since ticket 439 cut each fresh step's
// capsule from the body, #440's classifier named the dips on the 15 m/s level leg (rig-heavy too),
// the 25 m/s up leg and the 44 m/s down leg the collider halo stepping against ground the tick's
// own cut had opened. Since ticket 459 the substeps collide with the world that cut left, and the
// 25 m/s up and 44 m/s down legs hold; the 15 m/s level legs still dip under 80%, and the 25 and
// 44 m/s level legs dip so with the hold-out ablated since #397. Ticket 505 measured those level
// dips (depth, ticks, rate, mm and px lost) in `levelCutDips.lane.test.ts`; their owner is open,
// for the GD to set. The 78 m/s and
// 3600 m/s rigs meet a bore narrower than the body on a fresh path (#439), and a 3 s leg at
// 300 m/s needs a planet larger than planet 1.

type Leg = 'down' | 'level' | 'up'

/** A rig's stored levels, and the legs it holds its cut speed on. */
interface HeldRig {
  levels: Record<string, number>
  legs: readonly Leg[]
}

/**
 * Since the per-purchase drill of #552 the rigs hold purchases: 11 (13.3 m/s, the nearest to the old
 * 14.5; purchase 12's 16.5 lifts the rig-heavy rig past what its thrust climbs) and 14 (25.5). Rig
 * 1 holds 18 (60.9 m/s for the old 44.9): at purchases 15 to 17 (31.7 to 49 m/s) its 30 frames/s
 * up leg rises through cut ground without one ramped-up tick, where the old law's 40 to 50 m/s
 * rigs held it. A finding for the speed bars of #560, named here so the rig is not read as 44 m/s.
 */
const RIGS: Readonly<Record<string, HeldRig>> = {
  '15 m/s': {
    levels: { drill_power: 11, drill_tip: 600, engine: 5000 },
    legs: ['down', 'up'],
  },
  '25 m/s': { levels: { drill_power: 14, drill_tip: 600, engine: 5000 }, legs: ['down', 'up'] },
  '44 m/s (rig 1, #400)': { levels: { drill_power: 18, drill_tip: 200 }, legs: ['down', 'up'] },
}
const FRAME_RATES = [30, 144]
const MAX_BOUNDARY_CHANGE = 0.05

/**
 * The #421 bar's rigs on #397's footing: rig 1 is the 44 m/s rig; rig 2 and the floor-bound rig cut
 * at 3600 m/s with no floor (#439's), and #397 put the 15 m/s rig, the old floor's pace, in their
 * place; the rig-heavy one is it with its hull and hold upgraded too.
 */
const BAR_RIGS: Readonly<Record<string, HeldRig>> = {
  ...RIGS,
  'rig-heavy 15 m/s': {
    levels: { ...RIGS['15 m/s'].levels, hull: 5000, cargo_hold: 5000 },
    legs: ['down', 'up'],
  },
}
/** The rigs held on an up cut. */
const UP_RIGS = Object.fromEntries(
  Object.entries(BAR_RIGS).filter(([, { legs }]) => legs.includes('up')),
)
const MAX_OFF_SPEED = 0.05
const MIN_SPEED_SHARE = 0.8
const MAX_OFF_SPEED_TICK_SHARE = 0.02
/** Below this the body moved backwards; a stalled tick jitters at +-0.01 m/s. */
const BACKWARDS_M_PER_S = -0.02
/**
 * A leg judges at least this many ramped-up cut ticks: the rig-heavy rig lifts on its thrust,
 * under its cut speed, for most of its 2 s up leg.
 */
const MIN_JUDGED_TICKS = 10

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

/**
 * Off the pad, down a shaft, a level tunnel west, then up out of it, at `framesPerSecond` render
 * frames.
 */
function playScript(
  levels: Record<string, number>,
  framesPerSecond: number,
): Record<Leg, TickRead[]> {
  const rig = createRig(RAPIER, levels, framesPerSecond)
  const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(buildIntent(['aim_left']), ticks(2))
  const down = rig.hold(buildIntent(['aim_down']), ticks(3))
  const level = rig.hold(buildIntent(['aim_left']), ticks(3))
  return { down, level, up: rig.hold(buildIntent(['lift']), ticks(2)) }
}

/** The ramp long done: cutting at one drill speed from `CUT_FOLLOW_TICKS` + 2 before to the next. */
function isRampedCut(ticks: readonly TickRead[], at: number): boolean {
  if (at < CUT_FOLLOW_TICKS + 2 || at + 1 >= ticks.length) return false
  const around = ticks.slice(at - CUT_FOLLOW_TICKS - 2, at + 2)
  const speed = ticks[at].read?.cutSpeed
  return around.every(({ result, read }) => result.isCutting && read?.cutSpeed === speed)
}

/** The tick crossed into another cell, the ramp long done and the drill's speed unchanged round it. */
function isHeldBoundary(ticks: readonly TickRead[], at: number): boolean {
  return isRampedCut(ticks, at) && !isSameCell(ticks[at - 1].position, ticks[at].position)
}

function isSameCell(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y)
}

/** The largest share the speed changes by across each held boundary. */
function boundaryChangesOf(ticks: readonly TickRead[]): number[] {
  const changes: number[] = []
  for (let at = 1; at < ticks.length; at++) {
    if (!isHeldBoundary(ticks, at)) continue
    const before = ticks[at - 1].speed
    const across = [ticks[at].speed, ticks[at + 1].speed]
    changes.push(Math.max(...across.map((speed) => Math.abs(speed - before) / before)))
  }
  return changes
}

/** A ramped-up cut tick: the body's speed along its facing and the rig's commanded cut speed. */
interface CutTick {
  at: number
  speed: number
  cutSpeed: number
}

function rampedCutTicksOf(ticks: readonly TickRead[]): CutTick[] {
  const cut: CutTick[] = []
  for (let at = 1; at < ticks.length; at++) {
    const cutSpeed = ticks[at].read?.cutSpeed
    if (cutSpeed === undefined || !isRampedCut(ticks, at)) continue
    cut.push({ at, speed: ticks[at].speed, cutSpeed })
  }
  return cut
}

const isBackwards = ({ speed }: CutTick) => speed < BACKWARDS_M_PER_S

const isUnderShare = ({ speed, cutSpeed }: CutTick) => speed < MIN_SPEED_SHARE * cutSpeed

const isOffSpeed = ({ speed, cutSpeed }: CutTick) =>
  Math.abs(speed - cutSpeed) > MAX_OFF_SPEED * cutSpeed

/** A leg's ramped-up cut ticks against the #421 bar, named for the failure they would show. */
function judgeLegAgainstBar(leg: string, ticks: readonly TickRead[]): void {
  const cut = rampedCutTicksOf(ticks)
  expect(cut.length, `${leg}: ramped-up cut ticks`).toBeGreaterThanOrEqual(MIN_JUDGED_TICKS)
  expect(cut.filter(isBackwards), `${leg}: backwards`).toEqual([])
  expect(cut.filter(isUnderShare), `${leg}: under 80%`).toEqual([])
  const offSpeed = cut.filter(isOffSpeed)
  expect(offSpeed.length, `${leg}: more than 5% off`).toBeLessThanOrEqual(
    MAX_OFF_SPEED_TICK_SHARE * ticks.length,
  )
}

/**
 * An up leg's ramped-up cut ticks against #397's strict line (ticket 432): every one within 5% of
 * the rig's own cut speed, none backwards.
 */
function judgeLegOnEveryTick(leg: string, ticks: readonly TickRead[]): void {
  const cut = rampedCutTicksOf(ticks)
  expect(cut.length, `${leg}: ramped-up cut ticks`).toBeGreaterThanOrEqual(MIN_JUDGED_TICKS)
  expect(cut.filter(isBackwards), `${leg}: backwards`).toEqual([])
  expect(cut.filter(isOffSpeed), `${leg}: more than 5% off`).toEqual([])
}

const rigsOf = (rigs: Readonly<Record<string, unknown>>) =>
  Object.keys(rigs).map((rig) => [rig] as const)

/** A leg's boundaries against the 5% line, named for the failure they would show. */
function judgeLegAcrossBoundaries(leg: string, ticks: readonly TickRead[]): void {
  const changes = boundaryChangesOf(ticks)
  expect(changes.length, `${leg}: boundaries`).toBeGreaterThan(2)
  expect(Math.max(...changes), `${leg}: largest change`).toBeLessThanOrEqual(MAX_BOUNDARY_CHANGE)
}

/** Plays the rig at both frame rates and judges each leg it holds. */
function judgeRig(
  { levels, legs }: HeldRig,
  judge: (leg: string, ticks: readonly TickRead[]) => void,
): void {
  for (const framesPerSecond of FRAME_RATES) {
    const run = playScript(levels, framesPerSecond)
    for (const leg of legs) judge(`${framesPerSecond} frames/s ${leg}`, run[leg])
  }
}

describe('continuous cut-follow (tickets 400, 397, 421, 432)', () => {
  it.each(rigsOf(RIGS))(
    '%s rig: varies its speed by at most 5% across cell boundaries on its held legs, at 30 and 144 frames/s',
    (rig) => judgeRig(RIGS[rig], judgeLegAcrossBoundaries),
    240_000,
  )

  it.each(rigsOf(BAR_RIGS))(
    '%s rig: holds its own cut speed on its held legs, at 30 and 144 frames/s (#421 interim bar)',
    (rig) => judgeRig(BAR_RIGS[rig], judgeLegAgainstBar),
    240_000,
  )

  it.each(rigsOf(UP_RIGS))(
    '%s rig: holds its own cut speed within 5% on every ramped-up tick of an up cut, at 30 and 144 frames/s (ticket 432)',
    (rig) => judgeRig({ ...UP_RIGS[rig], legs: ['up'] }, judgeLegOnEveryTick),
    240_000,
  )

  it.todo(
    'the 15 m/s rig (and rig-heavy) in a level cut vary their speed by at most 5% across cell boundaries and hold the #421 interim bar (owner: open, to be set by the GD; measured by ticket 505 over 4 cell phases and at least 100 m a run: dips to 25.8% of the cut speed (rig-heavy 27.0%), 1-2 ticks under 80% each, 21 ticks at 30 frames/s and 23 at 144 (rig-heavy 12 and 14), largest boundary change 1.959 (rig-heavy 1.851), 2.9 and 3.3 dips per 100 m (rig-heavy 2.0 and 2.2), a dip losing up to 261 mm, 23.5 px at 12 m on 1080p, nearly every dip with a tick off the ground)',
  )

  it.todo(
    'the 25 and 44 m/s rigs hold the #421 interim bar in a level cut (owner: open, to be set by the GD; measured by ticket 505 over 4 cell phases and at least 100 m a run: 25 m/s dips to 33.6% of the cut speed, 1-2 ticks under 80% each, 12 ticks at 30 frames/s and 19 at 144, largest boundary change 1.976, 2.6 and 3.9 dips per 100 m, a dip losing up to 385 mm, 34.7 px at 12 m on 1080p; 44 m/s dips to 37.8%, 9 ticks under 80% at both rates, largest boundary change 1.521, 1.4 dips per 100 m, up to 406 mm, 36.5 px; no tick backwards, every dip with a tick off the ground)',
  )

  it.todo(
    'the 78 m/s and 3600 m/s rigs and a 300 m/s rig on a large planet vary their speed by at most 5% across cell boundaries, and never end a tick inside solid ground (#439: the swept carve clears a body-wide bore at any cells a tick)',
  )

  it.each(rigsOf(RIGS))(
    '%s rig: never ends a tick inside solid ground, and steps alike at 30 and 144 frames/s',
    (rig) => {
      const paths = FRAME_RATES.map((framesPerSecond) => {
        const run = playScript(RIGS[rig].levels, framesPerSecond)
        const ticks = [...run.down, ...run.level, ...run.up]
        expect(ticks.filter((tick) => tick.isInsideGround)).toEqual([])
        return ticks.map(({ position }) => position)
      })
      expect(paths[0]).toEqual(paths[1])
    },
    120_000,
  )
})
