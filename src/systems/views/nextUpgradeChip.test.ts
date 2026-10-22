import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { ONE_LINE_WORDS_MAX, TITLE_WORDS_MAX } from '../../constants/uiParts'
import { createScriptedSession, type ScriptedSession } from '../authority/scriptedSession'
import { nextUpgradePrice } from '../authority/workshopRules'
import { fromSafeInteger, type Money } from '../money'
import { contentOf } from '../registries/content'
import { vehicleItemOfferOf } from '../registries/vehicleItemSales'
import type { VehicleItem } from '../registries/vehicleLoadout'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setGunLevelCommand } from '../vehicle/vehicleCommands'
import { chipWordsOf, nextUpgradeChipOf, type NextUpgradeChip } from './nextUpgradeChip'
import type { TripLedger } from './tripIncome'
import { wordCountOf } from './uiTextBudget'
import { priceReading } from './viewParts'

// The strip's next-upgrade chip (spec #678, Progression 2; ticket 719): the cheapest new
// capability the rig lacks first, ahead of the next +% drill step, with a title of 3 words or
// fewer and a hover line of 12 or fewer naming the offer and how many trips away it is.

/** The guns' mount, their first level (`debug.setGunLevel` takes 0 or 10 to 160). */
const GUN_MOUNTED = 10

const LAMP = 'chip-probe.lamp'
const BELL = 'chip-probe.bell'

function itemOf(id: string): VehicleItem {
  return { id, iconId: `icon-${id}`, slots: ['powerup.1'], attach: null }
}

/** A slice selling two researched items at these prices, as a shop's modules are sold. */
function probeSelling(lampPrice: Money, bellPrice: Money): SliceDefinition {
  return {
    id: 'chip-probe',
    register(r) {
      r.content('vehicle-item', [itemOf(LAMP), itemOf(BELL)])
      r.vehicleItemSeller({
        id: 'chip-probe.seller',
        offerOf: (itemId) =>
          itemId === LAMP
            ? { name: 'Probe lamp', price: lampPrice }
            : { name: 'Probe bell', price: bellPrice },
      })
      r.vehicleItemResearch({ id: 'chip-probe.research', isResearched: () => true })
    },
  }
}

function freshSession(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, grantMoneyCommand('100'))
  return session
}

const chipOf = (session: ScriptedSession, ledger?: TripLedger) =>
  nextUpgradeChipOf(session.state(), 'p1', ledger)

describe('next-upgrade chip', () => {
  it('offers the cheapest new capability ahead of the drill step, even when the step is cheaper', () => {
    withRegistrations([probeSelling(fromSafeInteger(900), fromSafeInteger(700))], () => {
      const session = freshSession()
      session.submit(1, setGunLevelCommand(GUN_MOUNTED))
      const chip = chipOf(session)
      expect(chip).toMatchObject({
        kind: 'capability',
        offerKey: `item.${BELL}`,
        name: 'Probe bell',
      })
      expect(chip.price).toEqual(priceReading(fromSafeInteger(700)))
      expect(nextUpgradePrice(session.state(), 'p1', 'drill_power')).not.toEqual(chip.price)
    })
  })

  it('falls back to the cheaper drill step once no capability is on sale', () => {
    withRegistrations([], () => {
      const session = freshSession()
      session.submit(1, setGunLevelCommand(GUN_MOUNTED))
      expect(chipOf(session)).toMatchObject({ kind: 'track' })
      expect(chipOf(session).offerKey).toMatch(/^track\.drill_(power|tip)$/)
    })
  })

  it('offers the guns’ mount once the guns are on sale', () => {
    withRegistrations([], () => {
      expect(chipOf(freshSession())).toMatchObject({ kind: 'capability', offerKey: 'guns' })
    })
  })

  it('carries no trips-away guidance before a trip is done, and the count after one', () => {
    withRegistrations([probeSelling(fromSafeInteger(900), fromSafeInteger(700))], () => {
      const session = freshSession()
      expect(chipOf(session).guidanceText).toBeNull()
      const ledger: TripLedger = { ended: [fromSafeInteger(100)], current: null }
      expect(chipOf(session, ledger).guidanceText).toBe('6 trips away')
    })
  })

  it('names the offer and its guidance on hover, under a title of a few words', () => {
    withRegistrations([probeSelling(fromSafeInteger(900), fromSafeInteger(700))], () => {
      const ledger: TripLedger = { ended: [fromSafeInteger(100)], current: null }
      const words = chipWordsOf(chipOf(freshSession(), ledger))
      expect(words.text.title).toBe('New gear')
      expect(words.hoverLine).toBe('Probe bell: 6 trips away')
    })
  })

  it('keeps every sold capability’s chip within 3 title words and a 12-word hover line', () => {
    const chips = contentOf('vehicle-item').flatMap((item) => chipsNaming(item.id))
    expect(chips.length).toBeGreaterThan(0)
    const over = chips
      .map(chipWordsOf)
      .filter(
        (words) =>
          wordCountOf(words.text.title) > TITLE_WORDS_MAX ||
          wordCountOf(words.hoverLine) > ONE_LINE_WORDS_MAX,
      )
    expect(over).toEqual([])
  })
})

/** The item's chip at the widest guidance the chip can carry. */
function chipsNaming(itemId: string): NextUpgradeChip[] {
  const offer = vehicleItemOfferOf(itemId)
  if (offer === null) return []
  return [
    {
      kind: 'capability',
      offerKey: `item.${itemId}`,
      name: offer.name,
      iconId: 'icon',
      price: priceReading(offer.price),
      guidanceText: '999Dc trips away',
    },
  ]
}
