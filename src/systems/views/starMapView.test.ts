import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { fuelPriceOf, jumpFeeOf, jumpFuelUnitsOf } from '../economy/jumpFuel'
import { ECONOMY } from '../economy/economy'
import { formatAmount, formatPrice } from '../displayAmount'
import { toSafeInteger } from '../money'
import { planetDisplayNameOf } from '../registries/planetRow'
import { starMapViewOf, type StarMapPlanet } from './starMapView'

const setMoney = (amount: string) => ({ type: 'debug.setMoney', payload: { amount } }) as const
const setPlanet = (planetIndex: number) =>
  ({ type: 'debug.setPlanet', payload: { planetIndex } }) as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const dockAtSell = { type: 'dock', payload: { bay: 'sell' } } as const

/** A session on `planet` with `money` in the wallet, its tank filled with `fuel` units at the shop. */
function sessionWith({ planet = 1, money = '0', fuel = 0 }) {
  const session = createScriptedSession()
  if (planet !== 1) session.submit(0, setPlanet(planet))
  session.submit(1, setMoney(fuel > 0 ? '1e9' : money))
  session.submit(5, dockAtSell)
  if (fuel > 0) session.submit(6, buyFuel(fuel))
  if (fuel > 0) session.submit(7, setMoney(money))
  return session
}

function mapOf(session: ReturnType<typeof sessionWith>) {
  return starMapViewOf(session.state(), 'p1')
}

function planetAt(planets: readonly StarMapPlanet[], place: number): StarMapPlanet {
  const planet = planets.find((shown) => shown.place === place)
  if (planet === undefined) throw new Error(`place ${place} is not on the map`)
  return planet
}

describe('star map view (ticket 757)', () => {
  it("lists every planet of the session's system by name, the planet it is on marked", () => {
    const { system, planets } = mapOf(sessionWith({}))
    expect(system).toBe('1')
    expect(planets.map((planet) => planet.place)).toEqual([1, 2, 3, 4, 5])
    expect(planets.map((planet) => planet.name)).toEqual([1, 2, 3, 4, 5].map(planetDisplayNameOf))
    expect(planets.filter((planet) => planet.isHere).map((planet) => planet.place)).toEqual([1])
  })

  it('shows each planet the fuel its jump burns and what that fuel costs', () => {
    const { planets } = mapOf(sessionWith({ money: '1e9' }))
    for (const place of [2, 3, 4, 5]) {
      expect(planetAt(planets, place).fuel?.text).toBe(formatAmount(jumpFuelUnitsOf(1, place)))
      expect(planetAt(planets, place).fee?.text).toBe(formatPrice(jumpFeeOf(1, place)))
    }
  })

  it('shows no cost for the planet the session is on', () => {
    const here = planetAt(mapOf(sessionWith({})).planets, 1)
    expect(here).toMatchObject({ fuel: null, fee: null, shortfall: null, isDimmed: false })
  })

  it("shows the tank's fuel and how much its level holds", () => {
    const { tank } = mapOf(sessionWith({ fuel: 3 }))
    expect(tank.held.text).toBe('3')
    expect(tank.capacity.text).toBe(formatAmount(ECONOMY.starMap.fuel.tank.capacityAtLevel1))
  })

  it('shows the fuel the tank lacks for a jump and what buying it here charges', () => {
    const { planets } = mapOf(sessionWith({ money: '1e9', fuel: 3 }))
    const shortfall = planetAt(planets, 4).shortfall
    const lacking = toSafeInteger(jumpFuelUnitsOf(1, 4)) - 3
    expect(shortfall?.fuel.text).toBe(formatAmount(lacking))
    expect(shortfall?.price?.text).toBe(formatPrice(fuelPriceOf(1, lacking)))
    expect(planetAt(planets, 4).isDimmed).toBe(false)
  })

  it("says on each planet's line what the tank holds against its jump", () => {
    const { planets } = mapOf(sessionWith({ planet: 8, money: '1e30', fuel: 3 }))
    expect(planetAt(planets, 8).line).toBe('The planet you are on.')
    expect(planetAt(planets, 9).line).toMatch(/^Tank holds 3 fuel, short 2: .+ to buy here\.$/)
    expect(planetAt(planets, 1).line).toBe('Tank holds 3 fuel; too small a tank for this jump.')
    expect(mapOf(sessionWith({ fuel: 10 })).planets[1].line).toBe(
      'Tank holds 10 fuel, enough for this jump.',
    )
  })

  it('shows no shortfall for a jump the tank already holds', () => {
    const { planets } = mapOf(sessionWith({ fuel: 10 }))
    expect(planets.every((planet) => planet.shortfall === null)).toBe(true)
    expect(planets.some((planet) => planet.isDimmed)).toBe(false)
  })

  it('dims a planet whose shortfall the wallet cannot buy, still listing its numbers', () => {
    const { planets } = mapOf(sessionWith({ money: '0' }))
    const far = planetAt(planets, 5)
    expect(far.isDimmed).toBe(true)
    expect(far.fuel?.text).toBe(formatAmount(jumpFuelUnitsOf(1, 5)))
    expect(far.shortfall?.price).not.toBeNull()
  })

  it('never dims the next planet for an empty wallet, as the #648 clamp sells its hop', () => {
    const next = planetAt(mapOf(sessionWith({ money: '0' })).planets, 2)
    expect(next.shortfall?.price?.text).toBe('0')
    expect(next.isDimmed).toBe(false)
  })

  it("dims a planet whose fuel the tank's level cannot hold, whatever the wallet", () => {
    const { planets } = mapOf(sessionWith({ planet: 8, money: '1e30' }))
    const home = planetAt(planets, 1)
    expect(home.shortfall).toMatchObject({ price: null })
    expect(home.isDimmed).toBe(true)
  })

  it("reaches one hop past the session's planet on system 1's line past its last planet", () => {
    const { planets } = mapOf(sessionWith({ planet: 7 }))
    expect(planets.map((planet) => planet.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(planetAt(planets, 7).isHere).toBe(true)
  })
})
