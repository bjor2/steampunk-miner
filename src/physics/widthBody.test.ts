import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { withRegistrations } from '../registries/registrar'
import { resetGameStore } from '../store/gameStore'
import { withDriveReaching } from '../systems/authority/driveRigFixtures'
import { buildIntent } from '../systems/input/buildIntent'
import { growthStepMm } from '../systems/vehicle/bodyGrowth'
import { bodyHalfMmAt, boreRadiusMmAt } from '../systems/vehicle/drillBore'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { createRig, type Rig, type TickRead } from './cutFollowFixtures'

// The collider grows to the width level (ticket 750, GD lock on #662 Part B), through the live
// loop with the real store and authority: bottom-anchored on its support so it never sinks into
// the floor, only into ground the cut has opened, waiting while a bare shaft holds it, and a Mark
// bought mid-shaft clears within a bounded number of ticks with no stuck state. The width level
// comes from a fake source through withRegistrations, so no slice is imported; it can change
// between holds, as a purchase does.

const width = { level: 0 }

const WIDTH_PROBE: SliceDefinition = {
  id: 'width-probe',
  register: (r) => r.boreWidth({ id: 'width-probe.level', widthLevelsOf: () => width.level }),
}

/** Purchase 10's drill (10.7 m/s through planet 1's band-1 rock), a hold the legs never fill. */
const LEVELS = { drill_power: 10, cargo_hold: 60 }
const FRAMES_PER_SECOND = 60
/** A level leg's rig: its drive reaches purchase 10's cut, as a sideways cut moves at the lesser. */
const LEVEL_LEVELS = withDriveReaching(LEVELS, 10.7)
/** A level leg's turn out of its down bore: the body's own length and the bore's half width. */
const LEVEL_APPROACH_TICKS = 30
/** Room for two levels to grow on the ground off the pad before a leg starts. */
const GROW_TICKS = 120
/**
 * Where the specs grow and dig, m along planet 1's surface west of the dock: off the pad's
 * indestructible cells for a level-2 body (2.9 m), and east of the hill face at -14.2 m.
 */
const OPEN_GROUND_X = -11.5
/** The most ticks the drive west there may take. */
const DRIVE_OFF_MAX_TICKS = 200
const SETTLE_TICKS = 120
/** The cut-out bar for a Mark bought mid-shaft: two seconds of drilling on. */
const MID_SHAFT_CLEAR_TICKS = 120
/** The GD lock's wedge bar (#662): never stopped with the gate open for more than 2 ticks. */
const MAX_STALL_TICKS = 2
/** The most a growing body's wheels rise in a tick: a step's climb and a contact's few mm. */
const STEP_CLIMB_M = (growthStepMm() + 10) / 1000

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  width.level = 0
  resetGameStore()
  const sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'width-body', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

/** How a spec's rig starts: its frame rate, its upgrades, the width it grows on the pad. */
interface RigStart {
  framesPerSecond?: number
  levels?: Record<string, number>
  grownLevel?: number
}

/** A rig settled on the dock's level pad, run inside the width source's registration. */
function onThePad<T>(run: (rig: Rig) => T): T {
  return withRegistrations([WIDTH_PROBE], () => {
    const rig = createRig(RAPIER, LEVELS, FRAMES_PER_SECOND)
    rig.hold(buildIntent([]), SETTLE_TICKS)
    return run(rig)
  })
}

/**
 * A rig grown to `grownLevel` on the pad, as a Mark bought at the dock is, then driven off it and
 * settled on open ground, run inside the width source's registration.
 */
function onOpenGround<T>(run: (rig: Rig) => T, start: RigStart = {}): T {
  const { framesPerSecond = FRAMES_PER_SECOND, levels = LEVELS, grownLevel = 0 } = start
  return withRegistrations([WIDTH_PROBE], () => {
    const rig = createRig(RAPIER, levels, framesPerSecond)
    width.level = grownLevel
    rig.hold(buildIntent([]), GROW_TICKS)
    driveWestToOpenGround(rig)
    rig.hold(buildIntent([]), SETTLE_TICKS)
    return run(rig)
  })
}

function driveWestToOpenGround(rig: Rig): void {
  for (let tick = 0; tick < DRIVE_OFF_MAX_TICKS; tick++) {
    const [read] = rig.hold(buildIntent(['aim_left']), 1)
    if (read.position.x <= OPEN_GROUND_X) return
  }
  throw new Error('the rig never reached the open ground west of the dock')
}

/** The collider's wheels: its distance from the planet's centre less its half side, m. */
function wheelsOf(read: TickRead): number {
  return lengthOf(read.position) - read.bodyHalfSide
}

function lengthOf(point: Vector2): number {
  return Math.sqrt(point.x * point.x + point.y * point.y)
}

function isGrownTo(level: number): (read: TickRead) => boolean {
  return (read) => Math.round(read.bodyHalfSide * 1000) === bodyHalfMmAt(level)
}

/** The longest run of ticks with the gate open and the body all but still along its facing. */
function longestStallOf(reads: readonly TickRead[]): number {
  let longest = 0
  let run = 0
  for (const read of reads) {
    run = read.result.isCutting && Math.abs(read.speed) < 0.05 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest
}

/** How far the body went along the planet's surface over the ticks, m. */
function runOf(reads: readonly TickRead[]): number {
  const first = reads[0].position
  const last = reads[reads.length - 1].position
  return Math.hypot(last.x - first.x, last.y - first.y)
}

/** How far the body went down over the ticks, m. */
function descentOf(reads: readonly TickRead[]): number {
  return lengthOf(reads[0].position) - lengthOf(reads[reads.length - 1].position)
}

describe('width body', () => {
  it('grows a rig standing on the dock’s pad up from its wheels within half a second', () => {
    const reads = onThePad((rig) => {
      const before = rig.hold(buildIntent([]), 1)[0]
      width.level = 1
      return [before, ...rig.hold(buildIntent([]), 60)]
    })
    const grownAt = reads.findIndex(isGrownTo(1))
    expect(grownAt).toBeGreaterThan(0)
    expect(grownAt).toBeLessThanOrEqual(31)
    const startWheels = wheelsOf(reads[0])
    reads.forEach((read, at) => {
      expect(wheelsOf(read)).toBeGreaterThan(startWheels - 0.03)
      expect(read.isInsideGround).toBe(false)
      // Never a leap: a tick's rise is at most a step's climb of the floor and the contact's mm.
      if (at > 0) expect(wheelsOf(read) - wheelsOf(reads[at - 1])).toBeLessThan(STEP_CLIMB_M)
    })
  })

  it('reports the owned body’s centre on the collider’s wheels while it grows', () => {
    const reads = onThePad((rig) => {
      width.level = 1
      return rig.hold(buildIntent([]), 10)
    })
    for (const read of reads) {
      const reportedM = lengthOf({ x: read.result.pose.x / 1000, y: read.result.pose.y / 1000 })
      expect(reportedM - bodyHalfMmAt(1) / 1000).toBeCloseTo(wheelsOf(read), 1)
    }
  })

  it('grows in a bare shaft only into the clearance its cut left, never into its walls', () => {
    const reads = onOpenGround((rig) => {
      rig.hold(buildIntent(['aim_down']), 90)
      rig.hold(buildIntent([]), 30)
      width.level = 1
      return rig.hold(buildIntent([]), 90)
    })
    for (const read of reads) {
      expect(read.bodyHalfSide).toBeLessThan(boreRadiusMmAt(0) / 1000)
      expect(read.isInsideGround).toBe(false)
    }
    expect(reads.at(-1)?.bodyHalfSide).toBeLessThan(bodyHalfMmAt(1) / 1000)
  })

  it('clears a Mark bought mid-shaft within two seconds of drilling on, never stuck', () => {
    const reads = onOpenGround((rig) => {
      rig.hold(buildIntent(['aim_down']), 90)
      width.level = 1
      return rig.hold(buildIntent(['aim_down']), MID_SHAFT_CLEAR_TICKS + 30)
    })
    const grownAt = reads.findIndex(isGrownTo(1))
    expect(grownAt).toBeGreaterThan(0)
    expect(grownAt).toBeLessThanOrEqual(MID_SHAFT_CLEAR_TICKS)
    expect(longestStallOf(reads)).toBeLessThanOrEqual(MAX_STALL_TICKS)
    expect(reads.every((read) => !read.isInsideGround)).toBe(true)
  })

  it.each([
    [1, 30],
    [1, 144],
    [2, 60],
  ])(
    'digs straight down at width level %i as fast as the bare rig, never wedged (%i fps)',
    (level, framesPerSecond) => {
      const digAt = (grownLevel: number) =>
        onOpenGround((rig) => rig.hold(buildIntent(['aim_down']), 120), {
          framesPerSecond,
          grownLevel,
        })
      const bare = digAt(0)
      const wide = digAt(level)
      expect(wide.every(isGrownTo(level))).toBe(true)
      // The GD lock's straight-down bar on #662: at least 95% of the bare rig's pace.
      expect(descentOf(wide)).toBeGreaterThanOrEqual(0.95 * descentOf(bare))
      expect(longestStallOf(wide)).toBeLessThanOrEqual(MAX_STALL_TICKS)
      expect(wide.every((read) => !read.isInsideGround)).toBe(true)
    },
  )

  it('cuts a level tunnel at width level 1 as far as the bare rig, never wedged', () => {
    const tunnelAt = (grownLevel: number) =>
      onOpenGround(
        (rig) => {
          rig.hold(buildIntent(['aim_down']), 90)
          rig.hold(buildIntent(['aim_left']), LEVEL_APPROACH_TICKS)
          return rig.hold(buildIntent(['aim_left']), 90)
        },
        { levels: LEVEL_LEVELS, grownLevel },
      )
    const bare = tunnelAt(0)
    const wide = tunnelAt(1)
    expect(wide.every(isGrownTo(1))).toBe(true)
    expect(runOf(wide)).toBeGreaterThanOrEqual(0.95 * runOf(bare))
    expect(longestStallOf(wide)).toBeLessThanOrEqual(MAX_STALL_TICKS)
    expect(wide.every((read) => !read.isInsideGround)).toBe(true)
  })
})
