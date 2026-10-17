import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import { brokenCellsEnergyOf, brokenCellsOf } from '../systems/authority/cutCarryFixtures'
import {
  createScriptedSession,
  dockInBay,
  drill,
  FREEZE_ENEMIES,
  GROUND,
  poseAbove,
} from '../systems/authority/scriptedSession'
import { FACING } from '../systems/vehicle/vehiclePose'
import { energyMaxQuantaOf } from '../systems/vehicle/vehicleState'
import { createTripCellEnergyFold, tripTankMarginOf } from './tripCellEnergy'

/** A session whose every batch is told to the fold, as the bot session's `watchEvents` is. */
function watchedSession() {
  const session = createScriptedSession()
  const fold = createTripCellEnergyFold()
  const submit = (tick: number, intent: CommandIntent) => {
    const events = session.submit(tick, intent)
    fold.note(session.state(), events)
    return events
  }
  return { session, fold, submit }
}

describe('trips priced per cell (ticket 535, Systems on #514)', () => {
  it("prices a trip the player's reports cut per cell, beside what the reports were charged", () => {
    const { session, fold, submit } = watchedSession()
    submit(0, FREEZE_ENEMIES)
    submit(0, poseAbove(GROUND, FACING.down))
    const tank = energyMaxQuantaOf(session.vehicle())
    const before = session.state()
    const broken = brokenCellsOf(submit(60, poseAbove(GROUND, FACING.down, { drillTicks: 60 })))
    const [trip] = fold.trips()
    expect(broken.length).toBeGreaterThan(0)
    expect(trip).toMatchObject({
      planet: 1,
      ending: 'open',
      cells: broken.length,
      tankQuanta: tank,
    })
    expect(trip.perCellQuanta).toBe(brokenCellsEnergyOf(before, broken))
    expect(trip.chargedQuanta).toBe(tank - session.vehicle().energy)
    expect(trip.chargedQuanta).toBeGreaterThan(0)
    expect(tripTankMarginOf(trip)).toBe(tank / trip.perCellQuanta)
  })

  it('ends a trip at the dock and starts the next at the undock', () => {
    const { session, fold, submit } = watchedSession()
    submit(0, FREEZE_ENEMIES)
    submit(0, poseAbove(GROUND, FACING.down))
    submit(60, poseAbove(GROUND, FACING.down, { drillTicks: 60 }))
    const docked = dockInBay(session, 70, 'sell')
    fold.note(session.state(), docked)
    submit(80, { type: 'undock', payload: {} })
    submit(80, poseAbove(GROUND, FACING.down))
    const before = session.state()
    const broken = brokenCellsOf(submit(200, drill(GROUND, 120)))
    const [first, second] = fold.trips()
    expect(first.ending).toBe('dock')
    expect(second).toMatchObject({ startTick: 80, ending: 'open', cells: broken.length })
    expect(second.perCellQuanta).toBe(brokenCellsEnergyOf(before, broken))
  })
})
