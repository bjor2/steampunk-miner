import { describe, expect, it } from 'vitest'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
} from '../../../systems/authority/authorityState'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { collectOreUnit } from '../../../systems/authority/groundDrill'
import { minedOreOf, type MinedOre } from '../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { premiumLedgerOf } from '../../../systems/authority/premium/premiumLedgerState'
import {
  continueScriptedSession,
  WORLD_SEED,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { formatAmount } from '../../../systems/displayAmount'
import { assayBeaconLiftOf } from '../../../systems/economy/assayPricing'
import { oreSalePrice, oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import { largestLift, liftedSalePrice, type SaleLift } from '../../../systems/economy/saleLift'
import { add, cmp, fromCanonical, fromSafeInteger, mul, toCanonical } from '../../../systems/money'
import type { Money } from '../../../systems/money'
import { campaignIndex, planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { oreCell, RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { planetSpeciesOf } from '../../roster'
import { merchantPremiumLiftOf, premiumSpeciesAt } from './merchantPremium'
import { PLANET_KITS } from './planetKitRows'

// The merchant's ore premium on the kernel's ledger and sale-lift seams (ticket 821, PK2; the TD
// ruling on #821 as amended, Systems' goldens): a unit of the planet's own premium ore mined there
// sells at its merchant for ⌊V·max(5/4, beacon)⌋, once; every other unit, and every unit sold
// away from its origin, at the plain price.

const at = (system: string, planet: string) => ({ system, planet })
const FIRST_FIVE = ['1', '2', '3', '4', '5'].map((planet) => at('1', planet))
const HONEY_AMBER = 'honey-amber-quartzine'
const FIVE_FOURTHS: SaleLift = { num: 5n, den: 4n }
const BAND_ONE = 1
const MID_BAND = 3
/** g = 1, 2, 5, 6, 10 and 1e6 (VS row 0), then s = 2, 10 and 1e6 at p = 1. */
const GOLDEN_G = [1, 2, 5, 6, 10, 1_000_000]
const GOLDEN_SYSTEMS = [2n, 10n, 1_000_000n]
const sellAll = { type: 'sellCargo', payload: { resourceTier: 'all' } } as const

function stateOnPlanet(planetIndex: number): AuthorityState {
  return createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] })
}

/** The kind slot whose cells wear `speciesId` on the state's planet. */
function slotOfSpecies(state: AuthorityState, speciesId: string): number {
  const params = planetParamsOf(state.planet)!
  const slot = [...Array(16).keys()].find((at) => planetSpeciesOf(params, at)?.id === speciesId)
  if (slot === undefined) throw new Error(`no slot wears ${speciesId}`)
  return slot
}

/** The slot of a band-1 species that is not `speciesId`. */
function slotOfOtherSpecies(state: AuthorityState, speciesId: string): number {
  const params = planetParamsOf(state.planet)!
  return [...Array(16).keys()].find((at) => {
    const species = planetSpeciesOf(params, at)
    return species !== null && species.id !== speciesId
  })!
}

/** A band-1 crystal cell wearing `kindSlot`, as the drill mines it. */
function minedUnit(state: AuthorityState, kindSlot: number): MinedOre {
  const params = planetParamsOf(state.planet)!
  const cell = { tx: 20, ty: Math.floor(params.radiusTiles) - 3 }
  return minedOreOf(params, cell, oreCell(RESOURCE_FAMILY.crystal, 1, kindSlot))
}

function collectUnits(state: AuthorityState, ore: MinedOre, units: number) {
  const steps = [...Array(units).keys()]
  return steps.reduce(
    (step) => {
      const next = collectOreUnit(step.state, 'p1', ore)
      return { state: next.state, events: [...step.events, ...next.events] }
    },
    { state, events: [] as readonly unknown[] },
  )
}

function withCommons(state: AuthorityState, tier: number, units: number): AuthorityState {
  const vehicle = vehicleOf(state, 'p1')
  const held = vehicle.cargo.ore[tier] ?? 0
  const ore = { ...vehicle.cargo.ore, [tier]: held + units }
  return withVehicle(state, 'p1', { ...vehicle, cargo: { ...vehicle.cargo, ore } })
}

/** Planet 1 holding `premium` mined Honey Amber units and `commons` plain units of their tier. */
function planetOneHolding(premium: number, commons: number) {
  const start = stateOnPlanet(1)
  const ore = minedUnit(start, slotOfSpecies(start, HONEY_AMBER))
  const collected = collectUnits(start, ore, premium).state
  return {
    tier: ore.saleTier,
    session: continueScriptedSession(withCommons(collected, ore.saleTier, commons)),
  }
}

function sellAllHere(session: ScriptedSession, tick: number): DomainEvent[] {
  if (session.vehicle().mode === 'docked') session.submit(tick, { type: 'undock', payload: {} })
  session.submit(tick, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
  return session.submit(tick, sellAll)
}

const soldValueOf = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'ResourceSold')

const eventsOf = (events: readonly { type: string }[], type: string) =>
  events.filter((event) => event.type === type)

const times = (price: Money, units: number) => mul(price, fromSafeInteger(units))

function expectedValue(tier: number, premium: number, plain: number, lift: SaleLift): string {
  return toCanonical(
    add(times(liftedSalePrice(tier, lift), premium), times(oreSalePrice(tier), plain)),
  )
}

/** `g amount readout` of a sale. */
function saleLineOf(g: number, sale: Money): string {
  return `${g} ${toCanonical(sale)} ${formatAmount(sale)}`
}

function firstPlanetIndexOfSystem(system: bigint): number {
  return planetIndexOfCampaign(campaignIndex(system, 1n))
}

/** One premium unit on planet `g` with the beacon held: the larger lift, never the product. */
function premiumWithBeacon(g: number, tier: number): Money {
  const beacon = assayBeaconLiftOf(g, tier)
  const lifts = beacon === null ? [FIVE_FOURTHS] : [FIVE_FOURTHS, beacon]
  return liftedSalePrice(tier, largestLift(lifts))
}

describe('merchant premium (ticket 821)', () => {
  it('lifts the premium ore by 5/4, the +25% of the kit rows', () => {
    expect(merchantPremiumLiftOf(PLANET_KITS)).toEqual(FIVE_FOURTHS)
  })

  it('pays the premium on the merchant’s own premium ore only', () => {
    expect(premiumSpeciesAt(PLANET_KITS, at('1', '1'), HONEY_AMBER)).toBe(HONEY_AMBER)
    expect(premiumSpeciesAt(PLANET_KITS, at('1', '1'), 'violet-fluorite-quartzine')).toBeNull()
    expect(premiumSpeciesAt(PLANET_KITS, at('1', '1'), null)).toBeNull()
  })

  it('pays an ore its premium at its own planet’s merchant and never at another', () => {
    const paying = FIRST_FIVE.filter(
      (planet) => premiumSpeciesAt(PLANET_KITS, planet, HONEY_AMBER) !== null,
    )
    expect(paying).toEqual([at('1', '1')])
  })

  it('pays no premium where no merchant stands', () => {
    expect(premiumSpeciesAt(PLANET_KITS, at('1', '6'), HONEY_AMBER)).toBeNull()
  })
})

describe('merchant premium: counting mined units', () => {
  it('counts a Honey Amber unit mined on planet 1 under its tier and origin', () => {
    const start = stateOnPlanet(1)
    const ore = minedUnit(start, slotOfSpecies(start, HONEY_AMBER))
    const collected = collectUnits(start, ore, 2)
    expect(premiumLedgerOf(collected.state, 'p1')).toEqual([
      { tier: ore.saleTier, origin: '1:1', speciesId: HONEY_AMBER, units: '2' },
    ])
    expect(eventsOf(collected.events as DomainEvent[], 'OrePremiumLedgerChanged')).toHaveLength(2)
  })

  it('counts no other species of planet 1', () => {
    const start = stateOnPlanet(1)
    const collected = collectUnits(
      start,
      minedUnit(start, slotOfOtherSpecies(start, HONEY_AMBER)),
      2,
    )
    expect('premiumLedger' in collected.state.players.p1).toBe(false)
  })

  it('counts each planet’s own premium ore on that planet', () => {
    const start = stateOnPlanet(2)
    const premium = PLANET_KITS.merchants[1].premiumOre.speciesId
    const collected = collectUnits(start, minedUnit(start, slotOfSpecies(start, premium)), 1)
    expect(premiumLedgerOf(collected.state, 'p1')).toEqual([
      expect.objectContaining({ origin: '1:2', speciesId: premium, units: '1' }),
    ])
  })

  it('counts nothing on a planet where no merchant stands', () => {
    const start = stateOnPlanet(6)
    const params = planetParamsOf(start.planet)!
    const slots = [...Array(16).keys()].filter((slot) => planetSpeciesOf(params, slot) !== null)
    const collected = slots.reduce(
      (state, slot) => collectOreUnit(state, 'p1', minedUnit(start, slot)).state,
      start,
    )
    expect('premiumLedger' in collected.players.p1).toBe(false)
  })
})

describe('merchant premium at the Sell bay', () => {
  it('sells N mined premium units plus M commons of their tier for N·⌊5/4·V⌋ + M·V', () => {
    const { tier, session } = planetOneHolding(3, 2)
    const events = sellAllHere(session, 10)
    expect(soldValueOf(events)).toMatchObject({ value: expectedValue(tier, 3, 2, FIVE_FOURTHS) })
    expect(eventsOf(events, 'OreSaleLifted')).toEqual([
      expect.objectContaining({
        speciesId: HONEY_AMBER,
        units: '3',
        source: 'planet-kit.merchant-premium',
        lift: '5/4',
      }),
    ])
  })

  it('pays the premium once: a second sale of the same tier pays plain V', () => {
    const { tier, session } = planetOneHolding(2, 0)
    sellAllHere(session, 10)
    const held = continueScriptedSession(withCommons(session.state(), tier, 2))
    const events = sellAllHere(held, 12)
    expect(soldValueOf(events)).toMatchObject({ value: expectedValue(tier, 0, 2, FIVE_FOURTHS) })
    expect(premiumLedgerOf(held.state(), 'p1')).toEqual([])
  })

  it('takes the beacon’s lift where it lifts more, never the product of both', () => {
    const { tier, session } = planetOneHolding(3, 2)
    session.submit(2, { type: 'debug.setArtefact', payload: { optionId: 'artefact.assay_beacon' } })
    const events = sellAllHere(session, 10)
    const beacon = assayBeaconLiftOf(1, tier)!
    expect(soldValueOf(events)).toMatchObject({
      value: toCanonical(times(liftedSalePrice(tier, largestLift([FIVE_FOURTHS, beacon])), 5)),
    })
    expect(eventsOf(events, 'OreSaleLifted')).toEqual([
      expect.objectContaining({ units: '3', source: 'kernel.assay_beacon' }),
    ])
  })

  it('sells the premium ore away from its planet at plain V', () => {
    const { tier, session } = planetOneHolding(3, 0)
    session.submit(5, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
    const events = sellAllHere(session, 10)
    expect(soldValueOf(events)).toMatchObject({ value: expectedValue(tier, 0, 3, FIVE_FOURTHS) })
    expect(eventsOf(events, 'OreSaleLifted')).toEqual([])
  })
})

describe('merchant premium goldens (ticket 821)', () => {
  it('pays ⌊V(t)·5/4⌋ on the premium ore, with its #681 readout', () => {
    const lift = merchantPremiumLiftOf(PLANET_KITS)
    expect(GOLDEN_G.map((g) => saleLineOf(g, liftedSalePrice(oreTier(g, BAND_ONE), lift)))).toEqual(
      [
        '1 1.25e+1 12.5',
        '2 4.2187e+1 42.1',
        '5 1.621829e+3 1,621',
        '6 5.473673e+3 5,473',
        '10 7.10189108e+5 710k',
        '1000000 2.217191880798092496734020428214779540092e+528274 2e528274',
      ],
    )
  })

  it('never lifts the premium ore by more than a quarter over its value', () => {
    const lift = merchantPremiumLiftOf(PLANET_KITS)
    for (const g of [...GOLDEN_G, ...GOLDEN_SYSTEMS.map(firstPlanetIndexOfSystem)]) {
      const tier = oreTier(g, BAND_ONE)
      const quarterUp = mul(oreValue(tier), fromCanonical('1.25'))
      expect(cmp(liftedSalePrice(tier, lift), quarterUp)).toBeLessThan(1)
      expect(cmp(liftedSalePrice(tier, lift), oreSalePrice(tier))).toBe(1)
    }
  })

  it('takes the beacon’s band-3 price on band 1, where it lifts more than the premium', () => {
    expect(GOLDEN_G.map((g) => saleLineOf(g, premiumWithBeacon(g, oreTier(g, BAND_ONE))))).toEqual([
      '1 2.25e+1 22.5',
      '2 7.5937e+1 75.9',
      '5 2.919292e+3 2,919',
      '6 9.852612e+3 9,852',
      '10 1.278340394e+6 1.27M',
      '1000000 3.990945385436566494121236770786603172168e+528274 3e528274',
    ])
  })

  it('keeps the premium alone on a tier the beacon does not lift', () => {
    for (const g of GOLDEN_G) {
      const tier = oreTier(g, MID_BAND)
      expect(toCanonical(premiumWithBeacon(g, tier))).toBe(
        toCanonical(liftedSalePrice(tier, FIVE_FOURTHS)),
      )
    }
  })
})
