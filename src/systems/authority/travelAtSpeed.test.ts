import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { engineStatsAtStep } from '../economy/vehicleStats'
import { speedOfStepBound } from '../vehicle/stepBound'
import { travelSpeedOf } from '../vehicle/travelParity'
import { FACING } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { vehicleOf } from './authorityState'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import { createScriptedSession, PARAMS, poseAbove, type ScriptedSession } from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'

// The engine travel rows of ticket 560 (5c, VS and Systems on #551), on the authority's path: a
// rig with the first engine purchase reaching 100 or 240 m/s travels through open sky a step a
// tick at that speed, every step accepted, and a step one mm past the stats' travel bound is
// refused. The pure rows (every purchase to 200) are ticket 553's `engineTravelBound.test.ts`;
// the hold row carries the e <= 200 test.

const TRAVEL_ROWS_M_PER_S = [100, 240]
const MAX_ENGINE_PURCHASE = 200
const TICKS = 60
/** Twenty metres over the surface east of the pad: open sky, nothing to cut. */
const SKY = { x: 20_500, y: (surfaceRowOfColumn(20, PARAMS.radiusTiles) + 20) * 1000 + 500 }

function firstEnginePurchaseReaching(speed: number): number {
  for (let purchase = 0; purchase <= MAX_ENGINE_PURCHASE; purchase++) {
    if (engineStatsAtStep(purchase).speedMax >= speed) return purchase
  }
  throw new Error(`no engine purchase up to ${MAX_ENGINE_PURCHASE} reaches ${speed} m/s`)
}

function rigInTheSky(speed: number): ScriptedSession {
  const session = createScriptedSession()
  const level = firstEnginePurchaseReaching(speed)
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'engine', level } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...SKY } })
  return session
}

const stepTo = (x: number): CommandIntent<'drillStep'> => ({
  type: 'drillStep',
  payload: { x, y: SKY.y, facing: FACING.right, drive: { x: 1, y: 0 } },
})

const rejectionsOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CommandRejected')

describe.each(TRAVEL_ROWS_M_PER_S)('travel at %i m/s (ticket 560)', (speed) => {
  const strideMm = Math.round((speed * MM_PER_METRE) / TICKS_PER_SECOND)

  it('travels a second through open sky at its full speed, every step accepted', () => {
    const session = rigInTheSky(speed)
    for (let tick = 1; tick <= TICKS; tick++) session.submit(tick, stepTo(SKY.x + strideMm * tick))
    expect(rejectionsOf(session.events())).toEqual([])
    expect(session.vehicle().sweptCut?.poseXMm).toBe(SKY.x + strideMm * TICKS)
  })

  it('keeps its travel speed within the stats travel bound', () => {
    const session = rigInTheSky(speed)
    const vehicle = vehicleOf(session.state(), 'p1')
    const bound = speedOfStepBound(stepBoundsAt(session.state(), 'p1').travellingMm)
    expect(travelSpeedOf(vehicle, PARAMS)).toBeGreaterThanOrEqual(speed)
    expect(travelSpeedOf(vehicle, PARAMS)).toBeLessThanOrEqual(bound)
  })

  it('refuses a step one mm past the travel bound', () => {
    const session = rigInTheSky(speed)
    const boundMm = stepBoundsAt(session.state(), 'p1').travellingMm
    const [answer] = session.submit(1, stepTo(SKY.x + boundMm + 1))
    expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'invalid_pose' })
  })
})
