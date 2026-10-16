import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import { commandedSpeedsOf, createRig, type TickRead } from './cutFollowFixtures'

// The stop ramp follows the drive, not the contact (ticket 430, TD addendum on #430): once the
// drive lets go of a cut it follows, the body stops within 6 ticks, whether the gate shuts
// mid-ramp, the drill loses the ground or the ramp meets the uncut face. Swept over the cell cycle:
// a fresh rig cuts down (or down, then level west) for 2.5 s and lets go one tick later each run,
// a cell's worth of ticks at the slowest starting drill (40 at 1.50 m/s). At 30 frames/s a release
// lands on a frame, every second tick; at 144 on any tick. At a few phases the 15 m/s rig lets go
// of a level cut and bounces back off the face (#458) or ramps down slowly on a face #421's release
// cleared (#460). That rig cuts at the old 4-tick
// floor's pace #400's rig 2 had until ticket 397 took the floor out (rig 2 now jams, #439).

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
  '15 m/s rig': { drill_power: 200, drill_tip: 600, engine: 5000 },
}
const FRAME_RATES = [30, 144]
const LEGS = ['down', 'level'] as const
/** Release phases: a cell's drill time at the slowest starting drill, in ticks. */
const RELEASE_PHASES = 40
/** Within this share of the commanded speed the body holds it (#397's 5% line). */
const HELD_SHARE = 0.05
/** The body counts as stopped under this speed along the facing (#333's stop spec). */
const STOPPED_MPS = 0.05
/**
 * The 15 m/s rig's level releases that must stop in time until #458 closes. Rig 2 stopped at 3 in
 * 4 under the old floor; the 15 m/s rig that took its place (ticket 397) stops at 2 in 3 (4 of 6
 * phases at 30 frames/s, 9 of 13 at 144), and since #421's release 10 of 11 and 21 of 25.
 */
const LIP_STOPPED_SHARE_MIN = 0.65
/** The level release phases main followed, and how main stopped and backed off on them. */
interface PairedPhases {
  phases: readonly number[]
  stopped: number
  backwardTicks: number
  /** The deepest backward speed over the 6 ticks after letting go, m/s (rounded toward 0). */
  deepestBackwardMps: number
  /** The backward speeds summed over every phase's 6 ticks, m/s (rounded toward 0). */
  summedBackwardMps: number
}

/**
 * The like-for-like lip ratchet (GD ruling 6205935803, VS 6205939203, TD 6205950943 on #421): the
 * 15 m/s rig's level release phases main followed by this sweep's own rule (`isFollowingCut`), run
 * on main 2e229b0b (protocol 79) before ticket 421 and fixed here so a rebase cannot move the
 * denominator; each phase is the tick past 2.5 s the drive lets go.
 */
const MAIN_FOLLOWED_LEVEL: Readonly<Record<number, PairedPhases>> = {
  30: {
    phases: [6, 16, 20, 24, 26],
    stopped: 4,
    backwardTicks: 5,
    deepestBackwardMps: -0.6171,
    summedBackwardMps: -1.3008,
  },
  144: {
    phases: [5, 6, 7, 16, 19, 20, 21, 23, 24, 25, 26, 27, 37, 39],
    stopped: 12,
    backwardTicks: 17,
    deepestBackwardMps: -0.7622,
    summedBackwardMps: -3.8512,
  },
}
/**
 * Backward ticks on those phases after ticket 421 (6 at 30 frames/s, 24 at 144): more than main's
 * but shallower, so the count is recorded and may only shrink (third-pause ruling 6206873222, VS
 * 6206876410, TD on #421) while depth and sum carry the no-worse-than-main assert.
 */
const LIP_BACKWARD_TICKS_MAX: Readonly<Record<number, number>> = { 30: 6, 144: 24 }
/** Below this the body moved backwards; a stopped tick jitters at +-0.01 m/s. */
const BACKWARDS_M_PER_S = -0.02
/**
 * Releases a sweep must sample. A starting rig's level cut holds the drill's speed only some of
 * the time (#432's stall), so a sweep of 20 frame-aligned phases finds 4 to 8 followed releases.
 */
const MIN_FOLLOWED_RELEASES = 3

type Leg = (typeof LEGS)[number]

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

const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

/** A fresh rig cuts `leg` for `phase` ticks past 2.5 s, lets go, and reads the 6 ticks after. */
function releaseAt(
  levels: Record<string, number>,
  framesPerSecond: number,
  leg: Leg,
  phase: number,
) {
  const rig = createRig(RAPIER, levels, framesPerSecond)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(buildIntent(['aim_left']), ticks(2))
  if (leg === 'level') rig.hold(buildIntent(['aim_down']), ticks(3))
  const pressed = rig.hold(
    buildIntent([leg === 'level' ? 'aim_left' : 'aim_down']),
    ticks(2.5) + phase,
  )
  return { pressed, release: rig.hold(IDLE_INTENT, CUT_FOLLOW_TICKS) }
}

/** The releases of a followed cut, one per phase a frame can land on. */
function releasesOf(levels: Record<string, number>, framesPerSecond: number, leg: Leg) {
  const phaseStep = Math.max(1, Math.round(1 / (PHYSICS_TIMESTEP * framesPerSecond)))
  const releases: TickRead[][] = []
  for (let phase = 0; phase < RELEASE_PHASES; phase += phaseStep) {
    const { pressed, release } = releaseAt(levels, framesPerSecond, leg, phase)
    if (isFollowingCut(pressed, leg)) releases.push(release)
  }
  return releases
}

/**
 * The drive let go of a cut it was following (the addendum's case): the drill bit and the body held
 * the drill's speed on the last pressed tick, its wheels on the ground in a level cut. A rig that
 * had run on past the coast at travel's speed, or dropped into a cave mid-cut, was not.
 */
function isFollowingCut(pressed: readonly TickRead[], leg: Leg): boolean {
  const last = pressed.at(-1)
  const commanded = commandedSpeedsOf(pressed).at(-1) ?? 0
  if (last === undefined || !last.result.flags.isDrilling) return false
  if (leg === 'level' && !last.isOnGround) return false
  return Math.abs(last.speed - commanded) <= commanded * HELD_SHARE
}

/** The body moves under the stop line over one of the 6 ticks from the drive letting go. */
function isStoppedInTime(release: readonly TickRead[]): boolean {
  return release.some(({ speed }) => Math.abs(speed) < STOPPED_MPS)
}

/** The 6 ticks after letting go on each of main's followed phases. */
function pairedReleasesOf(paired: PairedPhases, framesPerSecond: number): TickRead[][] {
  return paired.phases.map(
    (phase) => releaseAt(RIGS['15 m/s rig'], framesPerSecond, 'level', phase).release,
  )
}

/** Every release tick that moved backwards, as its speed. */
function backwardSpeedsOf(releases: readonly (readonly TickRead[])[]): number[] {
  return releases
    .flat()
    .map(({ speed }) => speed)
    .filter((speed) => speed < BACKWARDS_M_PER_S)
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

const STRICT_SWEEPS = Object.keys(RIGS).flatMap((rig) =>
  LEGS.filter((leg) => !isLipSweep(rig, leg)).flatMap((leg) =>
    FRAME_RATES.map((framesPerSecond) => [rig, leg, framesPerSecond] as const),
  ),
)

function isLipSweep(rig: string, leg: Leg): boolean {
  return rig === '15 m/s rig' && leg === 'level'
}

describe('the stop ramp follows the drive (ticket 430 addendum)', () => {
  it.each(STRICT_SWEEPS)(
    '%s: stops within 6 ticks of the drive letting go at every phase of a %s cut, at %i frames/s',
    (rig, leg, framesPerSecond) => {
      const releases = releasesOf(RIGS[rig], framesPerSecond, leg)
      expect(releases.length).toBeGreaterThanOrEqual(MIN_FOLLOWED_RELEASES)
      expect(releases.filter((release) => !isStoppedInTime(release))).toEqual([])
    },
    240_000,
  )

  it.each(FRAME_RATES)(
    '15 m/s rig: stops within 6 ticks at 65% of the release phases of a level cut, at %i frames/s',
    (framesPerSecond) => {
      const releases = releasesOf(RIGS['15 m/s rig'], framesPerSecond, 'level')
      expect(releases.length).toBeGreaterThanOrEqual(MIN_FOLLOWED_RELEASES)
      const stopped = releases.filter(isStoppedInTime).length / releases.length
      expect(stopped).toBeGreaterThanOrEqual(LIP_STOPPED_SHARE_MIN)
    },
    240_000,
  )

  it.each(FRAME_RATES)(
    '15 m/s rig: backs off main’s followed level release phases no deeper and no more in sum than main, at %i frames/s',
    (framesPerSecond) => {
      const paired = MAIN_FOLLOWED_LEVEL[framesPerSecond]
      const backward = backwardSpeedsOf(pairedReleasesOf(paired, framesPerSecond))
      expect(Math.min(0, ...backward)).toBeGreaterThanOrEqual(paired.deepestBackwardMps)
      expect(sumOf(backward)).toBeGreaterThanOrEqual(paired.summedBackwardMps)
      expect(backward.length).toBeLessThanOrEqual(LIP_BACKWARD_TICKS_MAX[framesPerSecond])
    },
    240_000,
  )

  it.todo(
    '15 m/s rig: stops in time on at least as many of main’s followed level release phases as main (11 of 14 against 12 at 144 frames/s; #458 bounce-back off the face, #460 stop ramp on a cleared face)',
  )

  it.todo(
    '15 m/s rig: stops within 6 ticks at every release phase of a level cut (#458: the body bounces back off the face; #460: the stop ramp on a cleared face)',
  )
})
