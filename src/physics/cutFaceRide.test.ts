import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BASE_GRAVITY, PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { createRig, type Rig, type TickRead } from './cutFollowFixtures'
import { faceReadOf, isPopIn, type FaceRead } from './cutFaceRead'

// Riding the cut face (ticket 570, the GD lock's rows 1 and 2 and the G&V rows): while the drill
// cuts, the body stands on the face its cut opens, never above it, and the ground falls away at
// the front as it moves on, never a cell at a time. On every open-gate tick after a 6-tick settle:
//
// - the gap between the body's face and the ground ahead along its facing is at most 0.10 m;
// - no density sample drops by half its range (128) in a tick the cut's front did not cross;
// - the body stands on ground (isOnGround) and never moves further in a tick than the cut speed,
//   a tick's fall and a quarter metre (no snap).
//
// Down legs at drill purchases 1, 10 and 20 (1.5, 10.7 and 94 m/s on planet 1) on a column and on
// a tilted column, at 30 and 144 frames a second, and a level leg at purchase 10. A hold these legs
// never fill keeps #399's full-hold stop out of them (see `cutSmoothness.test.ts`). Ticks whose
// face is a cave the planet was generated with are left out: the cave is the face there, and the
// cut lets the body go (#433). The level leg turns out of a down bore and is judged once its body
// has left the bore it turned in.

/** The settle the GD lock allows after a leg's first open-gate tick. */
const SETTLE_TICKS = 6
const MAX_GAP_M = 0.1
/** A tick's move beyond the cut speed and a tick's fall: a quarter metre. */
const SNAP_SLACK_M = 0.25
const HOLD_NEVER_FULL = 60
const LEG_TICKS = 90
/** Judged ticks a leg must keep at least, caves and the settle left out. */
const MIN_JUDGED_TICKS = 30

type Start = 'column' | 'tilted'

interface FaceLeg {
  purchase: number
  start: Start
  aim: 'aim_down' | 'aim_left'
  framesPerSecond: number
}

const DOWN_LEGS: readonly FaceLeg[] = [1, 10, 20].flatMap((purchase) =>
  (['column', 'tilted'] as const).flatMap((start) =>
    [30, 144].map((framesPerSecond) => ({
      purchase,
      start,
      aim: 'aim_down' as const,
      framesPerSecond,
    })),
  ),
)

const LEGS: readonly FaceLeg[] = [
  ...DOWN_LEGS,
  { purchase: 10, start: 'column', aim: 'aim_left', framesPerSecond: 60 },
]

/**
 * The ticks a leg drives along the surface off the dock first: off the dock's pad for a column, its
 * up all but the grid's; further for a tilted column, its up well off the grid's.
 */
const DRIVE_TICKS: Record<Start, number> = { column: 50, tilted: 120 }
/** A level leg's turn out of its down bore: the body's own length and the bore's half width. */
const LEVEL_APPROACH_TICKS = 30

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  const sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'face-ride', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const ridden = new Map<FaceLeg, FaceRead[]>()

/** The leg's judged ticks, ridden once for the three rows that read it. */
function judgedTicksOf(leg: FaceLeg): FaceRead[] {
  const known = ridden.get(leg)
  if (known !== undefined) return known
  const judged = judgedOf(rideLeg(leg))
  ridden.set(leg, judged)
  return judged
}

/** Every tick of the leg, each read with the ground around it. */
function rideLeg(leg: FaceLeg): FaceRead[] {
  const levels = { drill_power: leg.purchase, cargo_hold: HOLD_NEVER_FULL }
  const rig = createRig(RAPIER, levels, leg.framesPerSecond)
  rig.hold(buildIntent(['aim_left']), DRIVE_TICKS[leg.start])
  rig.hold(buildIntent([]), 90)
  if (leg.aim === 'aim_left') turnOutOfDownBore(rig)
  return readTicks(rig, leg.aim)
}

function turnOutOfDownBore(rig: Rig): void {
  rig.hold(buildIntent(['aim_down']), LEG_TICKS)
  rig.hold(buildIntent(['aim_left']), LEVEL_APPROACH_TICKS)
}

/** Each tick read as it lands, before the frame's next tick runs. */
function readTicks(rig: Rig, aim: FaceLeg['aim']): FaceRead[] {
  const reads: FaceRead[] = []
  rig.hold(buildIntent([aim]), LEG_TICKS, (tick) => {
    reads.push(faceReadOf(tick, reads.at(-1) ?? null))
  })
  return reads.slice(0, LEG_TICKS)
}

/**
 * The open-gate ticks at least the settle past the gate's last opening, a cave face left out: a
 * cut that starts again past a cave lands on its face as a fresh one does.
 */
function judgedOf(reads: readonly FaceRead[]): FaceRead[] {
  let openTicks = 0
  return reads.filter((read) => {
    openTicks = read.tick.authorityGate === 1 ? openTicks + 1 : 0
    return openTicks > SETTLE_TICKS && !read.isFacingCave
  })
}

function snapLimitOf(tick: TickRead): number {
  const cutSpeed = tick.read?.cutSpeed ?? 0
  return cutSpeed * PHYSICS_TIMESTEP + BASE_GRAVITY * PHYSICS_TIMESTEP ** 2 + SNAP_SLACK_M
}

const ROW = 'purchase $purchase, $start, $aim at $framesPerSecond frames/s'

describe('riding the cut face (ticket 570)', () => {
  it.each(LEGS)(`keeps the face within 0.10 m of the ground, ${ROW}`, (leg) => {
    const judged = judgedTicksOf(leg)
    expect(judged.length).toBeGreaterThanOrEqual(MIN_JUDGED_TICKS)
    expect(Math.max(...judged.map((read) => read.gapM))).toBeLessThanOrEqual(MAX_GAP_M)
  })

  it.each(LEGS)(`pops no cell, ${ROW}`, (leg) => {
    const reads = judgedTicksOf(leg)
    const pops = reads.flatMap((read) => read.drops.filter((drop) => isPopIn(drop, read)))
    expect(pops).toEqual([])
  })

  it.each(LEGS)(`stands on ground, ${ROW}`, (leg) => {
    const airborne = judgedTicksOf(leg).filter((read) => !read.tick.isOnGround)
    expect(airborne.length).toBe(0)
  })

  it.each(LEGS)(`never snaps, ${ROW}`, (leg) => {
    const snaps = judgedTicksOf(leg).filter((read) => read.movedM > snapLimitOf(read.tick))
    expect(snaps.map((read) => read.movedM)).toEqual([])
  })
})
