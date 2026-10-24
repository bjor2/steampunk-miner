import { describe, expect, it } from 'vitest'
import { systemJumpFuelUnitsOf } from '../../economy/jumpFuel'
import { jumpDrivePrice } from '../../economy/systemJump'
import { fromCanonical, sub, toCanonical } from '../../money'
import { planetSeedAt } from '../../starMap/planetAddressSeed'
import { fuelOf } from '../../vehicle/vehicleFuel'
import { hasJumpDrive } from '../../vehicle/vehicleJumpDrive'
import type { DomainEvent } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import { createScriptedSession, typesOf, WORLD_SEED } from '../scriptedSession'
import { stateDigest } from '../stateDigest'

const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const buyFuelTank = { type: 'buyFuelTank', payload: {} } as const
const buyJumpDrive = { type: 'buyJumpDrive', payload: {} } as const
const dockAtSell = { type: 'dock', payload: { bay: 'sell' } } as const
const jumpTo = (system: string, planet: string) =>
  ({ type: 'jumpToPlanet', payload: { system, planet } }) as const

const rejectionOf = (events: readonly DomainEvent[]) =>
  events[0].type === 'CommandRejected' ? events[0].reason : null

/** A vehicle docked at the Sell bay of system 1's planet `planet`, `money` in the wallet. */
function dockedOn(planet: number, money: string) {
  const session = createScriptedSession()
  if (planet > 1) session.submit(0, setPlanet(planet))
  session.submit(1, setMoney(money))
  session.submit(5, dockAtSell)
  return session
}

/** On system 1's last planet with the drive fitted and the jump out's fuel in the tank. */
function readyToLeaveSystemOne() {
  const session = dockedOn(5, '1e9')
  session.submit(10, buyJumpDrive)
  session.submit(11, buyFuel(7))
  return session
}

describe('jump drive (ticket 759)', () => {
  it('fits the drive once at the Sell bay for its price, logging the cost', () => {
    const session = dockedOn(1, '1e6')
    const events = session.submit(10, buyJumpDrive)
    expect(hasJumpDrive(session.vehicle())).toBe(true)
    expect(typesOf(events)).toEqual(['JumpDriveBought', 'MoneyChanged'])
    expect(events[0]).toMatchObject({ cost: toCanonical(jumpDrivePrice()) })
    expect(toCanonical(session.state().players.p1.wallet)).toBe(
      toCanonical(sub(fromCanonical('1e6'), jumpDrivePrice())),
    )
  })

  it('refuses a second drive, a short wallet and a vehicle away from the Sell bay', () => {
    const session = dockedOn(1, '1e6')
    session.submit(10, buyJumpDrive)
    expect(rejectionOf(session.submit(11, buyJumpDrive))).toBe('jump_drive_owned')
    expect(rejectionOf(dockedOn(1, '1000').submit(10, buyJumpDrive))).toBe('money_short')
    expect(rejectionOf(createScriptedSession().submit(10, buyJumpDrive))).toBe('not_docked')
  })

  it('is for sale on planet 1 already: its row prices it, never locks it (#411)', () => {
    expect(rejectionOf(dockedOn(1, '1e6').submit(10, buyJumpDrive))).toBeNull()
  })
})

describe('jump between solar systems (ticket 759)', () => {
  it('refuses a jump into another system without the drive, and changes nothing', () => {
    const session = dockedOn(5, '1e9')
    session.submit(10, buyFuel(7))
    const before = session.state()
    expect(rejectionOf(session.submit(11, jumpTo('2', '1')))).toBe('no_jump_drive')
    expect(session.state()).toBe(before)
  })

  it("jumps from system 1's last planet to system 2's first for J times the hop's fuel", () => {
    const session = readyToLeaveSystemOne()
    const events = session.submit(20, jumpTo('2', '1'))
    expect(session.state().planet).toMatchObject({ index: 6, seed: WORLD_SEED, system: '2' })
    expect('fuel' in session.vehicle()).toBe(false)
    expect(events[0]).toMatchObject({
      type: 'TravelStarted',
      fromPlanet: 5,
      toPlanet: 6,
      fuelSpent: toCanonical(systemJumpFuelUnitsOf(5, 6)),
      toSystem: '2',
    })
    expect(typesOf(events)).toContain('PlanetEntered')
  })

  it("lands on a world of the new system's own address, docked", () => {
    const session = readyToLeaveSystemOne()
    session.submit(20, jumpTo('2', '1'))
    expect(planetParamsOf(session.state().planet)?.planetSeed).toBe(
      planetSeedAt(WORLD_SEED, 2n, 1n),
    )
    expect(session.vehicle().mode).toBe('docked')
  })

  it("tells system 2's first planet from system 1's sixth, the same campaign index", () => {
    const session = dockedOn(6, '1e9')
    session.submit(10, buyJumpDrive)
    session.submit(11, buyFuel(7))
    expect(rejectionOf(session.submit(12, jumpTo('2', '1')))).toBeNull()
    expect(session.state().planet).toMatchObject({ index: 6, system: '2' })
  })

  it('jumps back home to system 1 the same way, J times the fuel', () => {
    const session = readyToLeaveSystemOne()
    session.submit(20, jumpTo('2', '1'))
    session.submit(25, dockAtSell)
    session.submit(26, buyFuel(7))
    const events = session.submit(27, jumpTo('1', '5'))
    expect(session.state().planet).toEqual(
      expect.not.objectContaining({ system: expect.anything() }),
    )
    expect(session.state().planet.index).toBe(5)
    expect(events[0]).toMatchObject({ fuelSpent: '7e+0', toSystem: '1' })
  })

  it('refuses a jump the tank cannot burn with fuel_short, J included', () => {
    const session = dockedOn(5, '1e9')
    session.submit(10, buyJumpDrive)
    session.submit(11, buyFuel(6))
    expect(rejectionOf(session.submit(12, jumpTo('2', '1')))).toBe('fuel_short')
  })

  it('reaches further systems for the fuel of the distance in campaign index', () => {
    const session = dockedOn(1, '1e12')
    session.submit(10, buyJumpDrive)
    session.submit(11, buyFuelTank)
    session.submit(12, buyFuel(13))
    const events = session.submit(13, jumpTo('2', '1'))
    expect(events[0]).toMatchObject({ fromPlanet: 1, toPlanet: 6, fuelSpent: '1.3e+1' })
    expect(toCanonical(fuelOf(session.vehicle()))).toBe('0e+0')
  })

  it('keeps the #648 clamp on the jump out of a system: an empty wallet still leaves', () => {
    const session = dockedOn(5, '1e9')
    session.submit(10, buyJumpDrive)
    session.submit(11, setMoney('0'))
    const events = session.submit(12, buyFuel(7))
    expect(events[0]).toMatchObject({ type: 'FuelBought', units: 7, cost: '0e+0' })
    expect(rejectionOf(session.submit(13, jumpTo('2', '1')))).toBeNull()
  })

  it('gives the same planet, dock site and digest for the same seed and commands', () => {
    const jumped = () => {
      const session = readyToLeaveSystemOne()
      session.submit(20, jumpTo('2', '1'))
      return stateDigest(session.state())
    }
    expect(jumped()).toBe(jumped())
  })
})
