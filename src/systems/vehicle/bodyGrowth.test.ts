import { describe, expect, it } from 'vitest'
import { BODY_GROWTH_WAIT_LIMIT_TICKS, TICKS_PER_SECOND } from '../../constants/physics'
import {
  BARE_BODY_GROWTH,
  growthStepMm,
  isFullyGrown,
  isRoomToGrow,
  isWaitingForRoom,
  nextBodyGrowth,
  ownedCentreOf,
  type BodyGrowth,
  type IsBlockedAt,
} from './bodyGrowth'
import { bodyHalfMmAt } from './drillBore'

// The collider's growth to the width level (ticket 750, GD lock on #662 Part B): bottom-anchored,
// cut first, waiting with a limit behind ground in the way, and the owned body's centre the pose
// reports standing on the collider's wheels.

const UPRIGHT = { x: 0, y: 1 }
const OPEN: IsBlockedAt = () => false
const ALWAYS_ROOM = () => true
const NEVER_ROOM = () => false

function grownFor(ticks: number, ownedHalfMm: number, hasRoom = ALWAYS_ROOM): BodyGrowth {
  let growth = BARE_BODY_GROWTH
  for (let tick = 0; tick < ticks; tick++) growth = nextBodyGrowth(growth, ownedHalfMm, hasRoom)
  return growth
}

function ticksToGrow(ownedHalfMm: number): number {
  let growth = BARE_BODY_GROWTH
  let ticks = 0
  while (!isFullyGrown(growth, ownedHalfMm)) {
    growth = nextBodyGrowth(growth, ownedHalfMm, ALWAYS_ROOM)
    ticks++
  }
  return ticks
}

describe('body growth', () => {
  it('grows a width level within half a second of steps when the room is open', () => {
    expect(ticksToGrow(bodyHalfMmAt(1))).toBeLessThanOrEqual(TICKS_PER_SECOND / 2)
    expect(ticksToGrow(bodyHalfMmAt(1))).toBeGreaterThan(1)
  })

  it('takes no more than a level’s steps for each level it grows', () => {
    expect(ticksToGrow(bodyHalfMmAt(3))).toBeLessThanOrEqual(3 * ticksToGrow(bodyHalfMmAt(1)))
    expect(ticksToGrow(bodyHalfMmAt(3))).toBeGreaterThan(2 * ticksToGrow(bodyHalfMmAt(1)))
  })

  it('never grows past the owned body', () => {
    expect(grownFor(200, bodyHalfMmAt(1)).halfMm).toBe(bodyHalfMmAt(1))
  })

  it('waits at its size while the band it would take is not open', () => {
    const growth = grownFor(10, bodyHalfMmAt(1), NEVER_ROOM)
    expect(growth.halfMm).toBe(bodyHalfMmAt(0))
    expect(growth.waitedTicks).toBe(10)
  })

  it('asks for room only for the band one step takes', () => {
    const asked: number[][] = []
    nextBodyGrowth(BARE_BODY_GROWTH, bodyHalfMmAt(1), (fromMm, toMm) => {
      asked.push([fromMm, toMm])
      return true
    })
    expect(asked).toEqual([[bodyHalfMmAt(0), bodyHalfMmAt(0) + growthStepMm()]])
  })

  it('probes every step up to the wait limit, then once a period', () => {
    let probes = 0
    const counted = () => {
      probes++
      return false
    }
    grownFor(BODY_GROWTH_WAIT_LIMIT_TICKS * 3, bodyHalfMmAt(1), counted)
    expect(probes).toBe(BODY_GROWTH_WAIT_LIMIT_TICKS + 2)
  })

  it('says it waits for room once the wait passes its limit, and grows on once the room opens', () => {
    const waiting = grownFor(BODY_GROWTH_WAIT_LIMIT_TICKS, bodyHalfMmAt(1), NEVER_ROOM)
    expect(isWaitingForRoom(waiting)).toBe(true)
    let growth = waiting
    for (let tick = 0; tick <= BODY_GROWTH_WAIT_LIMIT_TICKS; tick++) {
      growth = nextBodyGrowth(growth, bodyHalfMmAt(1), ALWAYS_ROOM)
    }
    expect(growth.halfMm).toBeGreaterThan(bodyHalfMmAt(0))
    expect(isWaitingForRoom(growth)).toBe(false)
  })

  it('shrinks at the same pace when a level is lost, with no room asked', () => {
    const grown = grownFor(60, bodyHalfMmAt(1))
    const shrunk = nextBodyGrowth(grown, bodyHalfMmAt(0), NEVER_ROOM)
    expect(shrunk.halfMm).toBe(bodyHalfMmAt(1) - growthStepMm())
  })

  it('leaves a resting body’s growth as it is', () => {
    const grown = grownFor(60, bodyHalfMmAt(1))
    expect(nextBodyGrowth(grown, bodyHalfMmAt(1), NEVER_ROOM)).toBe(grown)
  })
})

describe('owned body centre', () => {
  it('stands the owned square on the collider’s wheels', () => {
    const centre = ownedCentreOf({ x: 3, y: 10.45 }, UPRIGHT, BARE_BODY_GROWTH, bodyHalfMmAt(1))
    expect(centre.x).toBe(3)
    expect(centre.y - bodyHalfMmAt(1) / 1000).toBeCloseTo(10.45 - bodyHalfMmAt(0) / 1000, 9)
  })

  it('is the collider’s centre once it is grown', () => {
    const grown = grownFor(60, bodyHalfMmAt(1))
    expect(ownedCentreOf({ x: 3, y: 10.95 }, UPRIGHT, grown, bodyHalfMmAt(1))).toEqual({
      x: 3,
      y: 10.95,
    })
  })

  it('rises along the body’s up on a tilted rig', () => {
    const up = { x: 0.6, y: 0.8 }
    const centre = ownedCentreOf({ x: 0, y: 0 }, up, BARE_BODY_GROWTH, bodyHalfMmAt(1))
    expect(centre.x).toBeCloseTo(0.6 * 0.5, 9)
    expect(centre.y).toBeCloseTo(0.8 * 0.5, 9)
  })
})

describe('room to grow', () => {
  const footing = { bottom: { x: 0, y: 0 }, up: UPRIGHT }

  it('finds room in open ground', () => {
    expect(isRoomToGrow(OPEN, footing, 450, 467)).toBe(true)
  })

  it('finds no room under a roof the grown top would reach', () => {
    const roofAt =
      (height: number): IsBlockedAt =>
      (_x, y) =>
        y >= height
    expect(isRoomToGrow(roofAt(0.93), footing, 450, 467)).toBe(false)
    expect(isRoomToGrow(roofAt(0.95), footing, 450, 467)).toBe(true)
  })

  it('finds no room beside a wall the grown side would reach', () => {
    const wallAt =
      (across: number): IsBlockedAt =>
      (x) =>
        x >= across
    expect(isRoomToGrow(wallAt(0.46), footing, 450, 467)).toBe(false)
    expect(isRoomToGrow(wallAt(0.47), footing, 450, 467)).toBe(true)
  })

  it('never reads the floor the wheels stand on as in the way', () => {
    const floor: IsBlockedAt = (_x, y) => y <= 0.01
    expect(isRoomToGrow(floor, footing, 450, 467)).toBe(true)
  })

  it('reads a lip on the floor beside the wheels as in the way', () => {
    const lip: IsBlockedAt = (x, y) => x >= 0.46 && y <= 0.1
    expect(isRoomToGrow(lip, footing, 450, 467)).toBe(false)
  })

  it('probes nothing inside the collider it already has', () => {
    const insideOnly: IsBlockedAt = (x, y) => Math.abs(x) < 0.44 && y > 0.05 && y < 0.89
    expect(isRoomToGrow(insideOnly, footing, 450, 467)).toBe(true)
  })

  it('turns the band with the body’s up', () => {
    const sideways = { bottom: { x: 0, y: 0 }, up: { x: 1, y: 0 } }
    const roofOnTheRight: IsBlockedAt = (x) => x >= 0.93
    expect(isRoomToGrow(roofOnTheRight, sideways, 450, 467)).toBe(false)
    expect(isRoomToGrow(roofOnTheRight, footing, 450, 467)).toBe(true)
  })
})
