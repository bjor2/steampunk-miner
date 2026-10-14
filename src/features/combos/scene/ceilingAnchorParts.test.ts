import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listenForOneShots } from '../../../store/oneShotRequests'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import type { PartMotionRequest } from '../../../systems/registries/partMotionRequests'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  aheadCellOf,
  anchorSession,
  densityOf,
  drillAt,
  freshDensityOf,
  lifting,
  TARGET,
  toggleAnchor,
} from '../ceilingAnchorTestSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { ANCHOR_DROP_CLANK } from '../systems/ceilingAnchor'
import { TILT_EASE_TICKS } from '../systems/render/anchorTilt'
import { createCeilingAnchorParts, type CeilingAnchorParts } from './ceilingAnchorParts'

// The anchor drop on the car (GD ruling Q2-Q4 on #288): the kernel's light clank is asked for
// exactly once, on the tick `isClinging` goes false mid up-cut, and never per cell; the drill
// head tilts toward the up-cut and eases back to level over about 4 ticks.

/** The authority tick of each clank heard, and of the step being asked. */
let clanks: number[] = []
let askedTick = 0
let stopListening: () => void = () => {}

beforeEach(() => {
  clanks = []
  stopListening = listenForOneShots((oneShot) => {
    if (oneShot.id === ANCHOR_DROP_CLANK.id) clanks.push(askedTick)
  })
})

afterEach(() => stopListening())

/** One fixed step's requests, asked after the step's authority tick. */
function stepParts(parts: CeilingAnchorParts, session: ScriptedSession) {
  askedTick = session.state().tick
  return parts.requestsAt(session.state(), 'p1')
}

/** Drills up-right one tick at a time over `target` from `fromTick` for `ticks`, stepping parts. */
function drillUpRight(
  parts: CeilingAnchorParts,
  session: ScriptedSession,
  fromTick: number,
  ticks: number,
  target: TilePoint = TARGET,
): readonly PartMotionRequest[][] {
  return Array.from({ length: ticks }, (_, step) => {
    drillAt(session, fromTick + step, lifting(1), { target })
    return [...stepParts(parts, session)]
  })
}

const angleOf = (requests: readonly PartMotionRequest[]) =>
  requests.length === 0 || requests[0].kind !== 'pose' ? 0 : requests[0].angle

describe('ceiling anchor parts: the drop', () => {
  it('asks for the light clank once, on the tick the anchor lets go mid up-cut', () => {
    const parts = createCeilingAnchorParts()
    const session = anchorSession()
    drillUpRight(parts, session, 3, 4)
    const cell = aheadCellOf(TARGET, FACING.up, 'right')
    expect(densityOf(session.state().world, cell)).toBeLessThan(freshDensityOf(cell))
    expect(densityOf(session.state().world, cell)).toBeGreaterThan(0)
    session.submit(7, toggleAnchor())
    stepParts(parts, session)
    drillUpRight(parts, session, 8, 6)
    expect(clanks).toEqual([7])
  })

  it('never asks for it while cutting up-diagonal across several cells', () => {
    const parts = createCeilingAnchorParts()
    const session = anchorSession()
    let target = TARGET
    let tick = 3
    const cut: TilePoint[] = []
    for (let cell = 0; cell < 3; cell++) {
      const next = aheadCellOf(target, FACING.up, 'right')
      while (densityOf(session.state().world, next) > 0 && tick < 600) {
        drillUpRight(parts, session, tick++, 1, target)
      }
      cut.push(next)
      target = next
    }
    cut.forEach((tile) => expect(densityOf(session.state().world, tile)).toBe(0))
    expect(clanks).toEqual([])
  })

  it('tilts the drill head toward the up-cut and eases it back to level once the anchor goes', () => {
    const parts = createCeilingAnchorParts()
    const session = anchorSession()
    const cutting = drillUpRight(parts, session, 3, 4)
    expect(cutting.at(-1)?.[0]).toMatchObject({
      attach: 'drill.head',
      slots: ['drill-head', 'drill-bit'],
    })
    expect(angleOf(cutting.at(-1)!)).toBeCloseTo(-Math.PI / 4)
    session.submit(7, toggleAnchor())
    const easing = [angleOf(stepParts(parts, session))]
    for (let tick = 8; tick < 8 + TILT_EASE_TICKS; tick++) {
      drillAt(session, tick, lifting(1))
      easing.push(angleOf(stepParts(parts, session)))
    }
    expect(easing.slice(0, TILT_EASE_TICKS - 1).every((angle) => angle < 0)).toBe(true)
    expect(easing.at(TILT_EASE_TICKS - 1)).toBe(0)
  })
})
