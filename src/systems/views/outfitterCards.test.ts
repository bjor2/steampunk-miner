import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../authority/scriptedSession'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { vehicleStatsAt } from '../economy/vehicleStats'
import { fromCanonical } from '../money'
import { grantMoneyCommand } from '../startScenarioCommands'
import { canonicalStatsOf } from '../vehicle/vehicleStatsView'
import { gainTextOf } from './gainText'
import { outfitterCardsOf } from './outfitterCards'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { selectUpgradeBayModel } from './upgradeBayModel'
import { wordCountOf } from './uiTextBudget'

// The Outfitter (spec #678, ticket 687): the Upgrade bay on the shared sheet, one card per thing
// it sells, with gain text and the price greyed while the wallet is short.

function cardsAtUpgradeBay(money: string) {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand(money))
  dockInBay(session, 2, 'upgrade')
  const model = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
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
