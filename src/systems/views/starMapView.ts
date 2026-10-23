/**
 * The star map as it draws (ticket 757; the GD lock on #650, comment 6361556890, Map UX, and the HS
 * input): the planets of the session's solar system, each with the fuel its jump burns and what
 * that fuel costs (`jumpFeeOf`, the figure the map shows), the tank's level, and any fuel the tank
 * lacks for the jump with what buying it at this planet's shop charges now (the #648 clamp
 * included). A planet the player cannot afford, whose shortfall the wallet cannot buy or the tank
 * cannot hold, is dimmed, never locked: the fuel price is the only gate, so every planet stays
 * listed with its numbers. Reads state only (HS): no command, no log line.
 *
 * A system holds `starMap.planetsPerSystem` planets (ticket 781); system 1's line runs on past them
 * (#781), so a session there past its last one sees the planets up to the hop after its own.
 */
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { systemOfPlanet, type SessionPlanet } from '../authority/planetOfState'
import { fuelChargeOf } from '../authority/starMap/fuelShopRules'
import { ECONOMY } from '../economy/economy'
import { jumpFeeOf, jumpFuelUnitsOf } from '../economy/jumpFuel'
import { cmp, sub, toSafeInteger, ZERO_MONEY, type BigStat, type Money } from '../money'
import { planetDisplayNameOf } from '../registries/planetRow'
import { planetIndexAt, planetsBefore } from '../starMap/campaignIndex'
import { toIndexText } from '../starMap/planetAddress'
import { fuelCapacityOf, fuelOf, hasRoomFor } from '../vehicle/vehicleFuel'
import type { VehicleState } from '../vehicle/vehicleState'
import { amountReading, priceReading, type AmountReading } from './viewParts'

export interface StarMapTank {
  /** Fuel units in the tank now. */
  held: AmountReading
  /** Fuel units the tank's level holds at most. */
  capacity: AmountReading
}

/** The fuel a jump needs past what the tank holds. */
export interface StarMapShortfall {
  fuel: AmountReading
  /** What buying it here charges now; null where the tank cannot hold the jump's fuel at all. */
  price: AmountReading | null
}

export interface StarMapPlanet {
  /** The planet's place in its system, from 1. */
  place: number
  name: string
  isHere: boolean
  /** The player cannot afford the jump now: drawn dimmed, still listed with its numbers. */
  isDimmed: boolean
  /** The fuel units the jump burns; null for the planet the session is on. */
  fuel: AmountReading | null
  /** What the jump's fuel costs; null for the planet the session is on. */
  fee: AmountReading | null
  /** Null when the tank holds the jump's fuel, and on the planet the session is on. */
  shortfall: StarMapShortfall | null
  /** One sentence: the tank's level against the jump's fuel, and any shortfall. */
  line: string
}

export interface StarMapView {
  /** The solar system's number, as canonical index text. */
  system: string
  tank: StarMapTank
  planets: StarMapPlanet[]
}

const HERE_LINE = 'The planet you are on.'

/** The shortfall as the rules count it: whole units and their charge, null past the tank. */
interface ShortfallQuote {
  units: BigStat
  charge: Money | null
}

export function starMapViewOf(state: AuthorityState, playerId: string): StarMapView {
  return {
    system: toIndexText(systemOfPlanet(state.planet)),
    tank: tankOf(vehicleOf(state, playerId)),
    planets: placesShownOf(state.planet).map((place) => planetOnMapOf(state, playerId, place)),
  }
}

function tankOf(vehicle: VehicleState): StarMapTank {
  return { held: amountReading(fuelOf(vehicle)), capacity: amountReading(fuelCapacityOf(vehicle)) }
}

/** Places 1 to the system's last planet, or to the hop after the session's own past it. */
function placesShownOf(planet: SessionPlanet): number[] {
  const count = Math.max(ECONOMY.starMap.planetsPerSystem, placeOf(planet) + 1)
  return Array.from({ length: count }, (_, index) => index + 1)
}

function placeOf(planet: SessionPlanet): number {
  return planet.index - Number(planetsBefore(systemOfPlanet(planet)))
}

function planetOnMapOf(state: AuthorityState, playerId: string, place: number): StarMapPlanet {
  const planetIndex = planetIndexAt(systemOfPlanet(state.planet), BigInt(place)) ?? 0
  const name = planetDisplayNameOf(planetIndex)
  if (planetIndex === state.planet.index) return herePlanetOf(place, name)
  return { place, name, ...jumpReadingsOf(state, playerId, planetIndex) }
}

function herePlanetOf(place: number, name: string): StarMapPlanet {
  return {
    place,
    name,
    isHere: true,
    isDimmed: false,
    fuel: null,
    fee: null,
    shortfall: null,
    line: HERE_LINE,
  }
}

function jumpReadingsOf(state: AuthorityState, playerId: string, toPlanet: number) {
  const units = jumpFuelUnitsOf(state.planet.index, toPlanet)
  const quote = shortfallQuoteOf(state, playerId, units)
  const shortfall = quote === null ? null : shortfallOf(quote)
  return {
    isHere: false,
    isDimmed: !canAffordShortfall(state.players[playerId].wallet, quote),
    fuel: amountReading(units),
    fee: priceReading(jumpFeeOf(state.planet.index, toPlanet)),
    shortfall,
    line: tankLineOf(amountReading(fuelOf(vehicleOf(state, playerId))), shortfall),
  }
}

function shortfallQuoteOf(
  state: AuthorityState,
  playerId: string,
  units: BigStat,
): ShortfallQuote | null {
  const vehicle = vehicleOf(state, playerId)
  const lacking = sub(units, fuelOf(vehicle))
  if (cmp(lacking, ZERO_MONEY) <= 0) return null
  if (!hasRoomFor(vehicle, lacking)) return { units: lacking, charge: null }
  return { units: lacking, charge: fuelChargeOf(state, playerId, toSafeInteger(lacking)) }
}

function canAffordShortfall(wallet: Money, quote: ShortfallQuote | null): boolean {
  if (quote === null) return true
  return quote.charge !== null && cmp(wallet, quote.charge) >= 0
}

function shortfallOf({ units, charge }: ShortfallQuote): StarMapShortfall {
  return { fuel: amountReading(units), price: charge === null ? null : priceReading(charge) }
}

function tankLineOf(held: AmountReading, shortfall: StarMapShortfall | null): string {
  const tank = `Tank holds ${held.text} fuel`
  if (shortfall === null) return `${tank}, enough for this jump.`
  if (shortfall.price === null) return `${tank}; too small a tank for this jump.`
  return `${tank}, short ${shortfall.fuel.text}: ${shortfall.price.text} to buy here.`
}
