import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { FUEL_TENDER_LOOK_SOURCE } from './fuelTenderLookSource'
import { FUEL_TENDER_TABLE } from './fuelTenderLook'
import { createDrawnVehicleLook, createLookFlashes, drawVehicleLookAt } from './vehicleLookFold'

// The coal tender's tail (ticket 758; the #576 ladder): above the top step every tank purchase
// wears the next finish (ticket 809), painted through the kernel vehicle look; on and below it the
// wagon is plain.

const setMoney = { type: 'debug.setMoney', payload: { amount: '1e12' } } as const
const dockAtSell = { type: 'dock', payload: { bay: 'sell' } } as const
const buyTank = { type: 'buyFuelTank', payload: {} } as const
const TOP = FUEL_TENDER_TABLE.steps[FUEL_TENDER_TABLE.steps.length - 1]
const FINISHES = FUEL_TENDER_TABLE.tail.finishes

/** A session whose tank stands at `level`, bought at the Sell bay. */
function sessionAtTankLevel(level: number) {
  const session = createScriptedSession()
  session.submit(1, setMoney)
  session.submit(2, dockAtSell)
  for (let bought = 1; bought < level; bought++) session.submit(3 + bought, buyTank)
  return session
}

describe('fuel tender look source (ticket 758)', () => {
  it('paints nothing on the starting tank and up to the top step', () => {
    expect(FUEL_TENDER_LOOK_SOURCE.lookOf(sessionAtTankLevel(1).state(), 'p1', 0)).toBeNull()
    expect(
      FUEL_TENDER_LOOK_SOURCE.lookOf(sessionAtTankLevel(TOP.fromLevel).state(), 'p1', 0),
    ).toBeNull()
  })

  it("glows the top wagon's slot in the first finish's colour one purchase past the top step, kept between frames", () => {
    const state = sessionAtTankLevel(TOP.fromLevel + 1).state()
    const look = FUEL_TENDER_LOOK_SOURCE.lookOf(state, 'p1', 0)
    expect(look).toMatchObject({
      tint: null,
      opacity: 1,
      outline: null,
      glows: [{ slots: [TOP.part], colour: FINISHES[0].colour, glow: FUEL_TENDER_TABLE.tail.glow }],
    })
    expect(FUEL_TENDER_LOOK_SOURCE.lookOf(state, 'p1', 7)).toBe(look)
  })

  it('answers nothing for a player not in the state and plays no flash', () => {
    expect(FUEL_TENDER_LOOK_SOURCE.lookOf(sessionAtTankLevel(9).state(), 'nobody', 0)).toBeNull()
    expect(FUEL_TENDER_LOOK_SOURCE.flashOf({ type: 'FuelTankBought' } as never)).toBeNull()
  })

  it('reaches the drawn vehicle look through the kernel fold with no slice registered', () => {
    const drawn = createDrawnVehicleLook()
    const state = sessionAtTankLevel(TOP.fromLevel + 2).state()
    drawVehicleLookAt(drawn, createLookFlashes(), { state, playerId: 'p1', tick: state.tick })
    expect(drawn.glows).toEqual([
      { slots: [TOP.part], colour: FINISHES[1].colour, glow: FUEL_TENDER_TABLE.tail.glow },
    ])
    expect(drawn.tint).toBeNull()
  })
})
