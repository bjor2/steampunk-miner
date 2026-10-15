import { describe, expect, it } from 'vitest'
import { CUT_COAST_METRES, CUT_FOLLOW_TICKS } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { CutFollowMotion } from './cutFollowMotion'
import {
  clearedSlabSpeedOf,
  cutMemoryAfter,
  FRESH_CUT_MEMORY,
  heldCutOf,
  type CutMemory,
  type ShutGateStep,
} from './heldCut'
import { FACING } from './vehiclePose'

// The held cut (ticket 430, TD shape and addendum on #430): through the gate's shut dwell the body
// coasts on the last `vCut` it followed, and once the drive lets go the stop ramp runs to zero
// whether or not the gate stays open.

const VCUT = 1.5

const FOLLOWED: CutFollowMotion = {
  speed: VCUT,
  facing: FACING.down,
  isPushing: true,
  followedTicks: CUT_FOLLOW_TICKS,
}

const PUSHING: ShutGateStep = { facing: FACING.down, isPushing: true, canCoast: true }
const RELEASED: ShutGateStep = { ...PUSHING, isPushing: false }

/** The memory after `ticks` ticks of the open gate following `cut`. */
function followedFor(cut: CutFollowMotion, ticks = CUT_FOLLOW_TICKS): CutMemory {
  let memory = FRESH_CUT_MEMORY
  for (let tick = 0; tick < ticks; tick++) {
    memory = cutMemoryAfter(memory, { cut, isGateOpen: true, isWaitingForCut: false })
  }
  return memory
}

/** Shut-gate ticks from `memory` while `step` holds, with the held cut each tick took. */
function shutTicksFrom(memory: CutMemory, step: ShutGateStep, ticks: number) {
  const cuts: (CutFollowMotion | undefined)[] = []
  let current = memory
  for (let tick = 0; tick < ticks; tick++) {
    const cut = heldCutOf(current, step)
    cuts.push(cut)
    current = cutMemoryAfter(current, { cut, isGateOpen: false, isWaitingForCut: false })
  }
  return { cuts, memory: current }
}

describe('held cut through the gate dwell (ticket 430)', () => {
  it('coasts on the last vCut, still held, once the gate shuts under a pushed cut', () => {
    const coast = heldCutOf(followedFor(FOLLOWED), PUSHING)
    expect(coast).toEqual({ ...FOLLOWED, isPushing: true })
  })

  it('carries the hold count through the coast, so the next cell meets a held body', () => {
    const { memory } = shutTicksFrom(followedFor(FOLLOWED), PUSHING, 10)
    expect(memory.followedTicks).toBe(CUT_FOLLOW_TICKS)
  })

  it('coasts at most one cell, then leaves the speed to travel', () => {
    const coastTicks = Math.ceil((CUT_COAST_METRES * TICKS_PER_SECOND) / VCUT)
    const { cuts } = shutTicksFrom(followedFor(FOLLOWED), PUSHING, coastTicks + 1)
    expect(cuts.slice(0, coastTicks).every((cut) => cut?.speed === VCUT)).toBe(true)
    expect(cuts[coastTicks]).toBeUndefined()
  })

  it('coasts as far at 30 and at 144 frames/s, the step being fixed', () => {
    const coastTicks = Math.ceil((CUT_COAST_METRES * TICKS_PER_SECOND) / VCUT)
    expect(coastTicks * (1 / TICKS_PER_SECOND) * VCUT).toBeGreaterThanOrEqual(CUT_COAST_METRES)
  })

  it('ends at once on a span stop, a lost bite or held wheels', () => {
    const memory = followedFor(FOLLOWED)
    expect(heldCutOf(memory, { ...PUSHING, canCoast: false })).toBeUndefined()
  })

  it('never coasts another facing than the one it cut', () => {
    expect(heldCutOf(followedFor(FOLLOWED), { ...PUSHING, facing: FACING.left })).toBeUndefined()
  })

  it('forgets the cut once travel drives, so a later shut gate never coasts', () => {
    const memory = cutMemoryAfter(followedFor(FOLLOWED), {
      cut: undefined,
      isGateOpen: false,
      isWaitingForCut: false,
    })
    expect(memory).toEqual(FRESH_CUT_MEMORY)
    expect(heldCutOf(memory, PUSHING)).toBeUndefined()
  })

  it('holds nothing after a span stop: a vCut of 0 or wheels waiting for the drill', () => {
    const stopped = cutMemoryAfter(followedFor(FOLLOWED), {
      cut: { ...FOLLOWED, speed: 0 },
      isGateOpen: true,
      isWaitingForCut: false,
    })
    const waiting = cutMemoryAfter(followedFor(FOLLOWED), {
      cut: FOLLOWED,
      isGateOpen: true,
      isWaitingForCut: true,
    })
    expect(heldCutOf(stopped, PUSHING)).toBeUndefined()
    expect(heldCutOf(waiting, PUSHING)).toBeUndefined()
  })

  it('keeps the last vCut over a slab the open gate has cleared', () => {
    expect(clearedSlabSpeedOf(followedFor(FOLLOWED), FACING.down)).toBe(VCUT)
    expect(clearedSlabSpeedOf(followedFor(FOLLOWED), FACING.up)).toBeUndefined()
    expect(clearedSlabSpeedOf(FRESH_CUT_MEMORY, FACING.down)).toBeUndefined()
  })
})

describe('stop ramp follows the drive (ticket 430 addendum)', () => {
  /** The memory after the drive let go of a followed cut for `ticks` open-gate ticks. */
  function releasedFor(ticks: number): CutMemory {
    let memory = followedFor(FOLLOWED)
    const letGo = { ...FOLLOWED, isPushing: false }
    for (let tick = 0; tick < ticks; tick++) {
      memory = cutMemoryAfter(memory, { cut: letGo, isGateOpen: true, isWaitingForCut: false })
    }
    return memory
  }

  it('keeps ramping to a stop when the gate shuts mid-ramp', () => {
    for (let ticks = 0; ticks < CUT_FOLLOW_TICKS; ticks++) {
      expect(heldCutOf(releasedFor(ticks), RELEASED)).toEqual({
        speed: VCUT,
        facing: FACING.down,
        isPushing: false,
        followedTicks: 0,
        releasedTicks: ticks,
      })
    }
  })

  it('runs the ramp for its 6 ticks and no longer', () => {
    const { cuts } = shutTicksFrom(releasedFor(2), RELEASED, CUT_FOLLOW_TICKS)
    expect(cuts.filter((cut) => cut !== undefined)).toHaveLength(CUT_FOLLOW_TICKS - 2)
    expect(cuts.at(-1)).toBeUndefined()
  })

  it('ramps to a stop whether or not the drill still bites', () => {
    const memory = releasedFor(1)
    expect(heldCutOf(memory, { ...RELEASED, canCoast: false })?.isPushing).toBe(false)
  })

  it('starts the ramp on the tick the gate shuts as the drive lets go', () => {
    expect(heldCutOf(followedFor(FOLLOWED), RELEASED)?.isPushing).toBe(false)
  })
})
