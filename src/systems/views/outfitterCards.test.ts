import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../authority/scriptedSession'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { ceil, div, fromCanonical, fromSafeInteger, sub } from '../money'
import { formatPrice } from '../displayAmount'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { buyGunCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { teleportToDockCommand } from '../vehicle/vehicleCommands'
import { canonicalStatsOf } from '../vehicle/vehicleStatsView'
import { gainTextOf } from './gainText'
import { outfitterCardsOf } from './outfitterCards'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { selectUpgradeBayModel } from './upgradeBayModel'
import { wordCountOf } from './uiTextBudget'
import type { TripLedger } from './tripIncome'

// The Outfitter (spec #678, ticket 687): the Upgrade bay on the shared sheet, one card per thing
// it sells, with gain text and the price greyed while the wallet is short.

function cardsAtUpgradeBay(money: string, tripLedger?: TripLedger) {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand(money))
  dockInBay(session, 2, 'upgrade')
  const model = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
    tripLedger,
  })
  return {
    model,
    cards: outfitterCardsOf(model),
    levels: session.state().players.p1.vehicle.levels,
  }
}

const cardOf = (cards: ReturnType<typeof outfitterCardsOf>, key: string) => {
  const card = cards.find((entry) => entry.id === `upgrade-bay.card.${key}`)
  if (card === undefined) throw new Error(`no card ${key}`)
  return card
}

describe('outfitter cards', () => {
  it('draws the six tracks in the bay order, then the Casing, and Repair last', () => {
    const { cards } = cardsAtUpgradeBay('0')
    const ids = cards.map((card) => card.id)
    expect(ids.slice(0, 7)).toEqual([
      ...UPGRADE_IDS.map((id) => `upgrade-bay.card.track.${id}`),
      'upgrade-bay.card.casing',
    ])
    expect(ids.at(-1)).toBe('upgrade-bay.card.repair')
  })

  it('says what the next drill power buys as a share of drill speed', () => {
    const { cards, levels } = cardsAtUpgradeBay('0')
    const next = { ...levels, drill_power: levels.drill_power + 1 }
    const before = canonicalStatsOf(vehicleStatsAt(levels)).drillPower
    const after = canonicalStatsOf(vehicleStatsAt(next)).drillPower
    const gain = gainTextOf(fromCanonical(before), fromCanonical(after), 'drill speed')
    expect(cardOf(cards, 'track.drill_power').line).toBe(gain)
    expect(gain).toMatch(/^\+[\d.]+% drill speed$/)
  })

  it('greys every price while the wallet is empty, and none once it is full', () => {
    const broke = cardsAtUpgradeBay('0').cards.filter((card) => card.id.includes('.track.'))
    const rich = cardsAtUpgradeBay('1e30').cards.filter((card) => card.id.includes('.track.'))
    expect(broke.every((card) => card.isMuted)).toBe(true)
    expect(rich.some((card) => card.isMuted)).toBe(false)
  })

  it('presses the bay buttons the model already holds, so ids and refusals stay the bay’s', () => {
    const { cards, model } = cardsAtUpgradeBay('1e30')
    const buttonIds = new Set(model.buttons.map((button) => button.id))
    expect(cards.every((card) => card.buttonId === null || buttonIds.has(card.buttonId))).toBe(true)
    expect(cardOf(cards, 'track.engine').buttonId).toBe(
      UI_ID_TEMPLATES.workshopUpgradeBuy('engine'),
    )
    expect(cardOf(cards, 'repair').buttonId).toBe(UI_IDS.workshopRepair)
  })

  it('shows each price as a number and keeps every title and line within the copy budget', () => {
    const { cards } = cardsAtUpgradeBay('1e30')
    const prices = cards.flatMap((card) => (card.priceText === null ? [] : [card.priceText]))
    expect(prices.every((price) => /^[\d.,]+[a-zA-Z]{0,2}$/.test(price))).toBe(true)
    expect(cards.every((card) => wordCountOf(card.title) <= 3)).toBe(true)
    expect(cards.every((card) => wordCountOf(card.line) <= 12)).toBe(true)
  })
})

describe('outfitter cards: a track note', () => {
  it('adds the drawing slice’s note after a track’s gain text, and to no other card', () => {
    const { model } = cardsAtUpgradeBay('0')
    const plain = outfitterCardsOf(model)
    const noted = outfitterCardsOf(model, (row) =>
      row.upgradeId === 'hull' ? 'Fitting: Plate' : null,
    )
    const hull = noted.find((card) => card.id === 'upgrade-bay.card.track.hull')!
    const plainHull = plain.find((card) => card.id === 'upgrade-bay.card.track.hull')!
    expect(hull.line).toBe(`${plainHull.line} · Fitting: Plate`)
    expect(noted.filter((card) => card !== hull)).toEqual(
      plain.filter((card) => card.id !== hull.id),
    )
  })
})

describe('outfitter cards: the new-capability flag', () => {
  it('marks only the two mounts on a new rig, never a track, Casing or Repair', () => {
    const { cards } = cardsAtUpgradeBay('1e30')
    expect(cards.filter((card) => card.isNewCapability).map((card) => card.id)).toEqual([
      'upgrade-bay.card.guns',
      'upgrade-bay.card.entry.ground-gun.mount',
    ])
  })

  it('marks the Guns card while it offers the mount, and not once the guns are on', () => {
    const session = createScriptedSession()
    session.submit(1, { type: 'debug.setPlanet', payload: { planetIndex: 4 } })
    session.submit(1, grantMoneyCommand('1e30'))
    session.submit(1, teleportToDockCommand('upgrade'))
    expect(cardOf(gunsCardsOf(session), 'guns').isNewCapability).toBe(true)
    session.submit(2, buyGunCommand(CLICK_CHAIN))
    expect(cardOf(gunsCardsOf(session), 'guns').isNewCapability).toBe(false)
  })

  it('shows no trips-away guidance before a trip is done', () => {
    const { cards } = cardsAtUpgradeBay('0')
    expect(cards.filter((card) => card.guidanceText !== null)).toEqual([])
  })

  it('says how many trips of the one trip’s income a short price is away, rounded up', () => {
    const { cards, model } = cardsAtUpgradeBay('0', ONE_TRIP_OF_40)
    const card = cardOf(cards, 'track.drill_power')
    expect(card.isMuted).toBe(true)
    const rest = sub(fromCanonical(card.priceExact!), model.guidance.balance)
    const trips = formatPrice(ceil(div(rest, fromSafeInteger(40))))
    expect(card.guidanceText).toBe(trips === '1' ? '1 trip away' : `${trips} trips away`)
  })

  it('reads Affordable on exactly the priced cards the wallet does not grey', () => {
    const priced = cardsAtUpgradeBay('300', ONE_TRIP_OF_40).cards.filter(
      (card) => card.priceText !== null,
    )
    expect(priced.some((card) => card.isMuted)).toBe(true)
    expect(priced.some((card) => !card.isMuted)).toBe(true)
    expect(priced.filter((card) => (card.guidanceText === 'Affordable') === card.isMuted)).toEqual(
      [],
    )
  })
})

const ONE_TRIP_OF_40: TripLedger = { ended: [fromSafeInteger(40)], current: null }

function gunsCardsOf(session: ReturnType<typeof createScriptedSession>) {
  const model = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
  return outfitterCardsOf(model)
}
