import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { buildIntent } from '../systems/input/buildIntent'
import { createRig, type TickRead } from './cutFollowFixtures'

// The swept carve clears a body-wide bore at any cells a tick (ticket 439, the TD shape on #397
// with the VS ruling), judged in the live loop at 30 and 144 frames a second: off the pad, then
// straight down until the body nears planet 1's core. A rig whose fresh first tick left its own
// cell standing rested on that lip at 0 m/s while its reach ran on, from about 97 m/s on planet 1.
// Planet radii stay under 1000 tiles, so the down leg is a tick count, not a 3 s leg: 3600 m/s
// crosses planet 1 in about 5 ticks.

/** The TD's rigs by stored drill_power/drill_tip, and the band-1 cut speed each reaches. */
const RIGS = [
  { speed: 97, levels: { drill_power: 370, drill_tip: 600 } },
  { speed: 240, levels: { drill_power: 450, drill_tip: 600 } },
  { speed: 3600, levels: { drill_power: 2000, drill_tip: 600 } },
] as const
const FRAME_RATES = [30, 144]

/** 2 s off the pad, then up to 8 s down. */
const PAD_TICKS = 120
const DOWN_TICKS = 480
/** Planet 1's core lies within 7 tiles of its centre; the leg is judged until the body is this near. */
const CORE_MARGIN_M = 20
/**
 * A jammed rig rests on its start lip for the whole leg, 7 m off the pad (466 straight cutting ticks
 * at 0 m/s at 97 m/s with no floor). A cutting rig may still pause a tick or three on the carry's
 * held-out cell (#421), never longer than the cut-follow's own ramp.
 */
const MAX_STALLED_RUN = CUT_FOLLOW_TICKS
const MIN_DOWN_M = 50

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

/** The rig's down leg until its body nears the core, at `framesPerSecond` render frames. */
function downLegOf(levels: Record<string, number>, framesPerSecond: number): TickRead[] {
  const rig = createRig(RAPIER, levels, framesPerSecond)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(buildIntent(['aim_left']), PAD_TICKS)
  const down = rig.hold(buildIntent(['aim_down']), DOWN_TICKS)
  const nearCore = down.findIndex(
    ({ position }) => Math.hypot(position.x, position.y) < CORE_MARGIN_M,
  )
  return nearCore < 0 ? down : down.slice(0, nearCore)
}

/** The longest run of ticks the cut gate was open and the body did not move on along its facing. */
function longestStallOf(ticks: readonly TickRead[]): number {
  let run = 0
  let longest = 0
  for (const { result, speed } of ticks) {
    run = result.isCutting && speed <= 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest
}

/** How far the body moved over the leg, in metres. */
function distanceMovedOver(ticks: readonly TickRead[]): number {
  const first = ticks[0].position
  const last = ticks[ticks.length - 1].position
  return Math.hypot(last.x - first.x, last.y - first.y)
}

describe('body-wide bore in the live loop (ticket 439)', () => {
  it.each(RIGS.map(({ speed, levels }) => [speed, levels] as const))(
    'the %i m/s rig never rests at 0 m/s with its cut gate open, and cuts on down, at 30 and 144 frames/s',
    (_, levels) => {
      const legs = FRAME_RATES.map((framesPerSecond) => downLegOf(levels, framesPerSecond))
      for (const down of legs) {
        expect(down.filter(({ result }) => result.isCutting).length).toBeGreaterThan(10)
        expect(longestStallOf(down)).toBeLessThanOrEqual(MAX_STALLED_RUN)
        expect(distanceMovedOver(down)).toBeGreaterThan(MIN_DOWN_M)
      }
      expect(legs[0].map(({ position }) => position)).toEqual(
        legs[1].map(({ position }) => position),
      )
    },
    240_000,
  )

  // #439 held this as a todo naming #421: the carry's held-out cell stood in the body's way.
  it.each(FRAME_RATES)(
    'the 3600 m/s rig never ends a tick inside solid ground on its way to the core, at %i frames/s',
    (framesPerSecond) => {
      const down = downLegOf(RIGS[2].levels, framesPerSecond)
      expect(down.filter(({ result }) => result.isCutting).length).toBeGreaterThan(10)
      expect(down.filter((tick) => tick.isInsideGround)).toEqual([])
    },
    240_000,
  )

  // The bore bar of Oct 16 on #439, ticked in the live body: the halo steps against the ground from
  // before the tick's cut (about 58 m/s, #440's finding). Ticket 421 lets the stamp carve the
  // carry's held-out cell; the halo's dips stay. The authority spec judges the bore's own share.
  it.todo(
    'every rig moves on at 80% or more of its commanded cut speed on every tick its cut gate is open (#459: the halo steps against ground the tick’s own cut opened)',
  )
})
