import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { commandedSpeedsOf, createRig, type TickRead } from './cutFollowFixtures'

// The cut-follow at the starting drill (ticket 430, TD shape and addendum on #430), in the live
// fixed-step loop with `drill.sweptCut` on. "Stored 1, 10 and 20" are stored drill_power steps with
// tip 0 (stored 10 is major 1): cutSpeed 1.50 / 1.62 / 1.86 m/s, where the cut gate shut in every
// cell and travel sped the body to the face ahead of the drill. Now the body coasts on its last
// vCut through the gate's shut dwell, and over a slab the cut has just cleared, so a down cut holds
// the drill's speed past its start; up and level are no worse than before (their stalls are a cell
// held out until the body's front arrives, #432). #400's two fast rigs ride along as a
// regression. Letting go of the drive is `cutFollowRelease.test.ts`.

const STARTING_RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
}
const FAST_RIGS: Readonly<Record<string, Record<string, number>>> = {
  'rig 1 (#400)': { drill_power: 300, drill_tip: 200 },
  'rig 2 (#400)': { drill_power: 2000, drill_tip: 600, engine: 5000 },
}
const ALL_RIGS = { ...STARTING_RIGS, ...FAST_RIGS }
const FRAME_RATES = [30, 144]
const LEG_SECONDS = 8
/** Within this share of the commanded speed a tick holds it (#397's 5% line). */
const HELD_SHARE = 0.05
/** The TD's bars on #430: down holds 95% of its ticks, none under 80%, none below -0.02 m/s. */
const DOWN_HELD_SHARE_MIN = 0.95
const DOWN_SLOWEST_SHARE = 0.8
const BACKWARD_MPS = -0.02
/** Up and level stay no worse than main (#430's table): 79% and 42% held. */
const UP_HELD_SHARE_MIN = 0.79
const LEVEL_HELD_SHARE_MIN = 0.42

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

/** Off the pad, then down, level west and up, `LEG_SECONDS` each. */
function playLegs(levels: Record<string, number>, framesPerSecond: number) {
  const rig = createRig(RAPIER, levels, framesPerSecond)
  const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  const offPad = rig.hold(buildIntent(['aim_left']), ticks(2))
  const down = rig.hold(buildIntent(['aim_down']), ticks(LEG_SECONDS))
  const level = rig.hold(buildIntent(['aim_left']), ticks(LEG_SECONDS))
  const up = rig.hold(buildIntent(['lift']), ticks(LEG_SECONDS))
  return { offPad, down, level, up }
}

/**
 * The ticks past the start from rest: from the second cell opening, plus the ramp. A cut from rest
 * stands until its first cell opens and again at the second, which the body meets before it is
 * paid (#433's breakdown: first cell, held, second stall); that start latency is #433's
 * measurement, not the gate's dwell (TD test 1 on #430 read with #433's split).
 */
function pastStartOf(ticks: readonly TickRead[]): { speed: number; commanded: number }[] {
  const commanded = commandedSpeedsOf(ticks)
  const firstCell = ticks.findIndex((tick) => tick.opensCell)
  const secondCell = ticks.findIndex((tick, at) => at > firstCell && tick.opensCell)
  if (firstCell < 0 || secondCell < 0) return []
  return ticks
    .map((tick, at) => ({ speed: tick.speed, commanded: commanded[at] }))
    .slice(secondCell + CUT_FOLLOW_TICKS)
}

function heldShareOf(ticks: readonly { speed: number; commanded: number }[]): number {
  const held = ticks.filter(
    ({ speed, commanded }) => Math.abs(speed - commanded) <= commanded * HELD_SHARE,
  )
  return held.length / ticks.length
}

/** Each frame rate's legs for a rig, played once and shared by the specs that read them. */
const playedLegs = new Map<string, ReturnType<typeof playLegs>>()

function legsOf(rig: string, framesPerSecond: number): ReturnType<typeof playLegs> {
  const key = `${rig}@${framesPerSecond}`
  const cached = playedLegs.get(key)
  if (cached !== undefined) return cached
  const legs = playLegs(ALL_RIGS[rig], framesPerSecond)
  playedLegs.set(key, legs)
  return legs
}

const rigsOf = (rigs: Record<string, unknown>) => Object.keys(rigs).map((rig) => [rig] as const)

describe('cut-follow at the starting drill (ticket 430)', () => {
  it.each(rigsOf(STARTING_RIGS))(
    '%s: holds the drill speed on 95% of the down ticks past the start, none under 80% or backward',
    (rig) => {
      const ticks = pastStartOf(legsOf(rig, 30).down)
      expect(ticks.length).toBeGreaterThan(300)
      expect(heldShareOf(ticks)).toBeGreaterThanOrEqual(DOWN_HELD_SHARE_MIN)
      const slowest = ticks.filter(({ speed, commanded }) => speed < commanded * DOWN_SLOWEST_SHARE)
      expect(slowest).toEqual([])
      expect(ticks.filter(({ speed }) => speed < BACKWARD_MPS)).toEqual([])
    },
    120_000,
  )

  it.each(rigsOf(STARTING_RIGS))(
    '%s: holds the drill speed up and level no worse than before the coast',
    (rig) => {
      const legs = legsOf(rig, 30)
      expect(heldShareOf(pastStartOf(legs.up))).toBeGreaterThanOrEqual(UP_HELD_SHARE_MIN)
      expect(heldShareOf(pastStartOf(legs.level))).toBeGreaterThanOrEqual(LEVEL_HELD_SHARE_MIN)
    },
    120_000,
  )

  it.todo(
    'holds the drill speed within 5% on 95% of the up ticks (#432: the lifting stamp holds the next cell out until the body front arrives)',
  )

  it.each(rigsOf(ALL_RIGS))(
    '%s: the motor gate equals the authority gate on every tick a step lands',
    (rig) => {
      const { offPad, down, level, up } = legsOf(rig, 30)
      const landed = [...offPad, ...down, ...level, ...up].filter(
        (tick) => tick.authorityGate !== null,
      )
      expect(landed.some((tick) => tick.result.isCutting)).toBe(true)
      for (const tick of landed) expect(tick.result.isCutting ? 1 : 0).toBe(tick.authorityGate)
    },
    120_000,
  )

  it.each(rigsOf(ALL_RIGS))(
    '%s: never ends a tick inside solid ground, and steps alike at 30 and 144 frames/s',
    (rig) => {
      const paths = FRAME_RATES.map((framesPerSecond) => {
        const { down, level, up } = legsOf(rig, framesPerSecond)
        const ticks = [...down, ...level, ...up]
        expect(ticks.filter((tick) => tick.isInsideGround)).toEqual([])
        return ticks.map(({ position }) => position)
      })
      expect(paths[0]).toEqual(paths[1])
    },
    240_000,
  )
})
