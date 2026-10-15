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
// lands on a frame, every second tick; at 144 on any tick. At a few phases #400's rig 2 lets go of
// a level cut pressed into #421's lip, and bounces off it.

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
  'rig 2 (#400)': { drill_power: 2000, drill_tip: 600, engine: 5000 },
}
const FRAME_RATES = [30, 144]
const LEGS = ['down', 'level'] as const
/** Release phases: a cell's drill time at the slowest starting drill, in ticks. */
const RELEASE_PHASES = 40
/** Within this share of the commanded speed the body holds it (#397's 5% line). */
const HELD_SHARE = 0.05
/** The body counts as stopped under this speed along the facing (#333's stop spec). */
const STOPPED_MPS = 0.05
/** Rig 2's level releases that must stop in time until #421 lifts the lip (main: 3 in 4). */
const LIP_STOPPED_SHARE_MIN = 0.85
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

const STRICT_SWEEPS = Object.keys(RIGS).flatMap((rig) =>
  LEGS.filter((leg) => !isLipSweep(rig, leg)).flatMap((leg) =>
    FRAME_RATES.map((framesPerSecond) => [rig, leg, framesPerSecond] as const),
  ),
)

function isLipSweep(rig: string, leg: Leg): boolean {
  return rig === 'rig 2 (#400)' && leg === 'level'
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
    'rig 2 (#400): stops within 6 ticks at 85% of the release phases of a level cut, at %i frames/s',
    (framesPerSecond) => {
      const releases = releasesOf(RIGS['rig 2 (#400)'], framesPerSecond, 'level')
      expect(releases.length).toBeGreaterThanOrEqual(MIN_FOLLOWED_RELEASES)
      const stopped = releases.filter(isStoppedInTime).length / releases.length
      expect(stopped).toBeGreaterThanOrEqual(LIP_STOPPED_SHARE_MIN)
    },
    240_000,
  )

  it.todo(
    'rig 2 (#400): stops within 6 ticks at every release phase of a level cut (#421: the body rests pressed into the carry target-cell lip and bounces off it)',
  )
})
