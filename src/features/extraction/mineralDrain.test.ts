import { describe, expect, it } from 'vitest'
import { dockInBay } from '../../systems/authority/scriptedSession'
import { fromSafeInteger, toCanonical } from '../../systems/money'
import { cargoUnitsOf, statsOfVehicle } from '../../systems/vehicle/vehicleState'
import { CELL_KIND } from '../../systems/world/worldCell'
import { chargesLeftOf } from '../power-up-core'
import {
  ACT_TICK,
  cellKindAt,
  DRAIN_ID,
  drainSessionAt,
  ofType,
  oreTilesAround,
  poseAt,
  press,
  PRESS_TICK,
  standingTileWithOre,
} from './drainTestSession'
import { EXTRACTION_POWER_UPS } from './systems/extractionContent'
import { FRESH_TRIP, incomeTripOf } from './systems/incomeTrip'
import { tripCapAt } from './systems/tripCap'

// The mineral drain in play on the loaded slices (#162 extractors table, 2.1 channel, 4.2, 4.5):
// a 60-tick channel that turns the nearest ore cells in reach to plain ground and pays half their
// ore into the hold, held to the hard trip cap and reset at the dock.

/** Enough ore in reach that the first use stops at the planet-1 cap, not for want of cells. */
const ORIGIN = standingTileWithOre(5)
/** The second charge is ready once the first's 900-tick cooldown has run from its act. */
const SECOND_PRESS_TICK = ACT_TICK + 900

function drainedOnce() {
  const session = drainSessionAt(ORIGIN)
  session.submit(PRESS_TICK, press())
  session.advanceTo(ACT_TICK + 4)
  return session
}

const chargesLeft = (session: ReturnType<typeof drainSessionAt>) =>
  chargesLeftOf(session.state(), 'p1', DRAIN_ID)

/** The cells one drain at `ORIGIN` takes when power-up-core hands it `magnitude` (#249). */
function cellsTakenWithMagnitude(magnitude: number | null): number {
  const session = drainSessionAt(ORIGIN)
  session.advanceTo(PRESS_TICK)
  const [drain] = EXTRACTION_POWER_UPS
  const use = { playerId: 'p1', itemId: DRAIN_ID, slot: 'powerup.1' as const, tick: ACT_TICK }
  const outcome = drain.activate(session.state(), { ...use, origin: ORIGIN, mark: 0, magnitude })
  if (outcome.kind !== 'acted') throw new Error(`the drain did not act: ${outcome.kind}`)
  const yielded = outcome.effect.events.find((event) => event.type === 'extraction.DrainYielded')
  return (yielded as unknown as { cells: number }).cells
}

describe('mineral drain', () => {
  it('turns the nearest ore cells to plain ground and pays half their ore into the hold', () => {
    const session = drainedOnce()
    const [yielded] = ofType(session.events(), 'extraction.DrainYielded')
    expect(yielded).toMatchObject({ tick: ACT_TICK, playerId: 'p1', itemId: DRAIN_ID, band: 1 })
    const { cells, units } = yielded as unknown as { cells: number; units: number }
    const drained = oreTilesAround(ORIGIN).slice(0, cells)
    expect(drained.map((tile) => cellKindAt(session, tile))).toEqual(
      drained.map(() => CELL_KIND.ground),
    )
    expect(units).toBe(Math.floor(cells / 2))
    expect(cargoUnitsOf(session.vehicle().cargo)).toBe(units)
    expect(ofType(session.events(), 'CargoAdded')).toHaveLength(units)
    expect(chargesLeft(session)).toBe(1)
  })

  it('counts what it paid against the trip cap of the band it stood in', () => {
    const session = drainedOnce()
    const cap = tripCapAt(1, 1, statsOfVehicle(session.vehicle()).cargoCapacity)
    expect(incomeTripOf(session.state(), 'p1')).toMatchObject({
      incomeItemValue: toCanonical(fromSafeInteger(10)),
      tripCap: toCanonical(cap),
    })
  })

  it('is refused drain_capped at the cap, spending no charge and draining nothing', () => {
    const session = drainedOnce()
    const worldBefore = session.state().world
    session.submit(SECOND_PRESS_TICK, press())
    session.advanceTo(SECOND_PRESS_TICK + 64)
    expect(ofType(session.events(), 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: DRAIN_ID, reason: 'extraction.drain_capped', chargesLeft: 1 },
    ])
    expect(ofType(session.events(), 'extraction.DrainYielded')).toHaveLength(1)
    expect(session.state().world).toBe(worldBefore)
    expect(chargesLeft(session)).toBe(1)
  })

  it('drains nothing and gives the charge back when the miner moves during the channel', () => {
    const session = drainSessionAt(ORIGIN)
    session.submit(PRESS_TICK, press())
    session.submit(PRESS_TICK + 30, poseAt(ORIGIN, 900))
    session.advanceTo(ACT_TICK + 4)
    expect(ofType(session.events(), 'power-up-core.ChannelCancelled')).toHaveLength(1)
    expect(ofType(session.events(), 'extraction.DrainYielded')).toEqual([])
    expect(oreTilesAround(ORIGIN).map((tile) => cellKindAt(session, tile))).toEqual(
      oreTilesAround(ORIGIN).map(() => CELL_KIND.ore),
    )
    expect(chargesLeft(session)).toBe(2)
  })

  it('takes as many cells per use as its Mark gives it, and the #162 base with none', () => {
    expect(cellsTakenWithMagnitude(1)).toBe(1)
    expect(cellsTakenWithMagnitude(null)).toBeGreaterThan(1)
  })

  it('starts every trip fresh: the counter resets when the miner docks', () => {
    const session = drainedOnce()
    expect(incomeTripOf(session.state(), 'p1')).not.toEqual(FRESH_TRIP)
    dockInBay(session, ACT_TICK + 10, 'sell')
    expect(incomeTripOf(session.state(), 'p1')).toEqual(FRESH_TRIP)
    expect(session.state().players.p1.slices?.extraction).toBeUndefined()
  })
})
