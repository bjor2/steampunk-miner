import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { toSafeInteger } from '../money'
import { jumpFuelUnitsOf } from '../economy/jumpFuel'
import {
  buyFuelCommand,
  buyFuelTankCommand,
  buyJumpDriveCommand,
  jumpToPlanetCommand,
  undockCommand,
} from '../platform/platformCommands'
import { teleportToDockCommand } from '../vehicle/vehicleCommands'
import {
  STAR_MAP_BUY_DRIVE_ID,
  STAR_MAP_BUY_TANK_ID,
  STAR_MAP_JUMP_OUT_ID,
  starMapBuyFuelIdOf,
  starMapControlsOf,
  starMapJumpIdOf,
  type StarMapControls,
} from './starMapControls'

// Ticket 793: the star map's Jump (two presses), its Buy fuel at the Sell bay, the tank and the
// jump drive where they are sold, and the jump out of the system once the drive is fitted.

const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const
const dockAtSell = { type: 'dock', payload: { bay: 'sell' } } as const

const NOTHING_ARMED = { armedJumpId: null }

/** A session on `planet` with `money`, docked at `bay` (or not docked), its tank holding `fuel`. */
function sessionWith({
  planet = 1,
  money = '0',
  bay = 'sell' as 'sell' | 'upgrade' | null,
  fuel = 0,
}) {
  const session = createScriptedSession()
  if (planet !== 1) session.submit(0, setPlanet(planet))
  session.submit(1, setMoney('1e30'))
  session.submit(5, dockAtSell)
  if (fuel > 0) session.submit(6, buyFuelCommand(fuel))
  if (bay !== 'sell') session.submit(7, undockCommand())
  if (bay === 'upgrade') session.submit(8, teleportToDockCommand(bay))
  session.submit(9, setMoney(money))
  return session
}

function controlsOf(session: ReturnType<typeof sessionWith>, armedJumpId: string | null = null) {
  return starMapControlsOf(session.state(), 'p1', { armedJumpId })
}

function planetAt(controls: StarMapControls, place: number) {
  const planet = controls.planets.find((shown) => shown.place === place)
  if (planet === undefined) throw new Error(`no controls for place ${place}`)
  return planet
}

describe('star map controls (ticket 793)', () => {
  it('gives every planet but the one the session is on a Jump', () => {
    const controls = controlsOf(sessionWith({}))
    expect(controls.planets.map((planet) => planet.place)).toEqual([2, 3, 4, 5])
    expect(controls.planets.map((planet) => planet.jump.id)).toEqual(
      [2, 3, 4, 5].map(starMapJumpIdOf),
    )
  })

  it("arms a Jump on its first press and sends the jump on the armed one's", () => {
    const session = sessionWith({ fuel: 10 })
    expect(planetAt(controlsOf(session), 3).jump).toMatchObject({
      label: 'Jump',
      action: { kind: 'armJump' },
      reason: null,
    })
    expect(planetAt(controlsOf(session, starMapJumpIdOf(3)), 3)).toMatchObject({
      isArmed: true,
      jump: {
        label: 'Confirm jump',
        action: { kind: 'submit', intent: jumpToPlanetCommand(1n, 3n) },
      },
    })
    expect(planetAt(controlsOf(session, starMapJumpIdOf(3)), 2).isArmed).toBe(false)
  })

  it('refuses a jump the tank cannot fuel on the screen, naming the fuel it is short', () => {
    const lacking = toSafeInteger(jumpFuelUnitsOf(1, 5))
    expect(planetAt(controlsOf(sessionWith({})), 5).jump).toMatchObject({
      label: `Jump, short ${lacking} fuel`,
      reason: 'fuel_short',
    })
  })

  it('offers the shortfall as a Buy fuel at the Sell bay, as the fuel shop sells it', () => {
    const session = sessionWith({ money: '1e9', fuel: 1 })
    const lacking = toSafeInteger(jumpFuelUnitsOf(1, 4)) - 1
    expect(planetAt(controlsOf(session), 4).buyFuel).toMatchObject({
      id: starMapBuyFuelIdOf(4),
      label: `Buy ${lacking} fuel`,
      action: { kind: 'submit', intent: buyFuelCommand(lacking) },
      reason: null,
    })
  })

  it("refuses a Buy fuel the wallet cannot pay, so the planet's jump stays out of reach", () => {
    const far = planetAt(controlsOf(sessionWith({ money: '0' })), 5)
    expect(far.buyFuel?.reason).toBe('money_short')
    expect(far.jump.reason).toBe('fuel_short')
  })

  it('offers no Buy fuel for a jump the tank already holds, nor away from the Sell bay', () => {
    expect(planetAt(controlsOf(sessionWith({ fuel: 10 })), 2).buyFuel).toBeNull()
    for (const bay of ['upgrade', null] as const) {
      const controls = controlsOf(sessionWith({ money: '1e9', bay }))
      expect(controls.planets.every((planet) => planet.buyFuel === null)).toBe(true)
    }
  })

  it('refuses every Jump while the vehicle is not docked', () => {
    const controls = controlsOf(sessionWith({ fuel: 10, bay: null }))
    expect(controls.planets.map((planet) => planet.jump.reason)).toEqual([
      'not_docked',
      'not_docked',
      'not_docked',
      'not_docked',
    ])
  })

  it('sells the next tank level and the jump drive at the Sell bay only', () => {
    const atSell = controlsOf(sessionWith({ money: '1e30' }))
    expect(atSell.buyTank?.button).toMatchObject({
      id: STAR_MAP_BUY_TANK_ID,
      action: { kind: 'submit', intent: buyFuelTankCommand() },
    })
    expect(atSell.buyDrive?.button).toMatchObject({
      id: STAR_MAP_BUY_DRIVE_ID,
      action: { kind: 'submit', intent: buyJumpDriveCommand() },
    })
    expect(atSell.buyTank?.price.text).not.toBe('')
    const atUpgrade = controlsOf(sessionWith({ money: '1e30', bay: 'upgrade' }))
    expect(atUpgrade).toMatchObject({ buyTank: null, buyDrive: null })
  })

  it("offers the jump to the next system on the system's last planet once the drive is fitted", () => {
    const session = sessionWith({ planet: 5, money: '1e30' })
    expect(controlsOf(session).jumpOut).toBeNull()
    session.submit(10, buyJumpDriveCommand())
    const controls = controlsOf(session)
    expect(controls.buyDrive).toBeNull()
    expect(controls.jumpOut?.jump).toMatchObject({ id: STAR_MAP_JUMP_OUT_ID, reason: 'fuel_short' })
    expect(controlsOf(session, STAR_MAP_JUMP_OUT_ID).jumpOut?.jump.action).toEqual({
      kind: 'submit',
      intent: jumpToPlanetCommand(2n, 1n),
    })
    expect(controls.jumpOut?.buyFuel?.reason).toBeNull()
  })

  it('offers no jump out of the system from any other planet, drive or not', () => {
    const session = sessionWith({ planet: 4, money: '1e30' })
    session.submit(10, buyJumpDriveCommand())
    expect(controlsOf(session).jumpOut).toBeNull()
  })

  it('lists every control as a focus stop in reading order: purchases, each fuel then its Jump', () => {
    const controls = controlsOf(sessionWith({ money: '1e9', fuel: 2 }))
    expect(controls.focusStops.map((stop) => stop.id)).toEqual(
      controls.buttons.map((button) => button.id),
    )
    expect(controls.buttons.slice(0, 2).map((button) => button.id)).toEqual([
      STAR_MAP_BUY_TANK_ID,
      STAR_MAP_BUY_DRIVE_ID,
    ])
    const ids = controls.buttons.map((button) => button.id)
    expect(ids.indexOf(starMapBuyFuelIdOf(5))).toBe(ids.indexOf(starMapJumpIdOf(5)) - 1)
  })

  it('reads the state only: the same state gives the same controls', () => {
    const session = sessionWith({ money: '1e9' })
    expect(controlsOf(session)).toEqual(starMapControlsOf(session.state(), 'p1', NOTHING_ARMED))
  })
})
