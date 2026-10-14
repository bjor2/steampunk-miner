import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { BotSession } from '../../../systems/bot/botSession'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { add, fromCanonical, ZERO_MONEY } from '../../../systems/money'
import type { BotPurchase } from '../../../systems/registries/botPurchases'
import { FORK_FIXTURE_SLICE } from '../treeFixtureSlice'
import { PLAYER, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { FORK_CHOICE_BOT_PURCHASE, FORK_RECHOICE_BOT_PURCHASE } from './forkBotPurchases'
import { laneSpendRowsOf } from './laneSpend'
import { RESEARCH_BOT_PURCHASE } from './researchBotPurchase'
import { treeSpendRowsOf } from './treeSpendGuard'

/**
 * Buys through the purchase as the pacing bot does (`botSlicePurchases.ts`): the spend record
 * holds the purchase's estimate and what it bought, then the command goes to the authority.
 */
function buyAsBot(session: BotSession, purchase: BotPurchase, payload: unknown) {
  const state = session.state()
  expect(purchase.isAvailable(state, PLAYER, payload)).toBe(true)
  const spend: ShopSpend = {
    planetIndex: state.planet.index,
    source: 'slice',
    purchaseId: purchase.id,
    boughtId: purchase.boughtIdOf!(payload),
    cost: purchase.estimateCost(state, PLAYER, payload),
  }
  const events = session.submit({ type: purchase.command, payload } as CommandIntent)
  return { spend, events }
}

function chargedCostOf(events: readonly DomainEvent[]) {
  const fork = events.find(
    (event) => event.type === 'tech-tree.ForkChosen' || event.type === 'tech-tree.ForkRechosen',
  )
  return fromCanonical((fork as { cost: string }).cost)
}

/** On P22: Wide chosen, its Mark 2 researched, then switched to Deep at the platform. */
function forkSpendsOnPlanet22() {
  const session = sessionOnPlanet(22)
  const choice = buyAsBot(session, FORK_CHOICE_BOT_PURCHASE, { lane: 'drill-gear', branch: 'wide' })
  const research = buyAsBot(session, RESEARCH_BOT_PURCHASE, {
    nodeId: 'tech.mark.power.fork_wide.2',
  })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  const rechoice = buyAsBot(session, FORK_RECHOICE_BOT_PURCHASE, {
    lane: 'drill-gear',
    branch: 'deep',
  })
  return { choice, research, rechoice }
}

describe('tech tree: fork re-choice in the #212 spend guard', () => {
  it('counts a re-choice in the denominator as a service cost, never in the numerator', () => {
    withFixtureTree(() => {
      const { choice, research, rechoice } = forkSpendsOnPlanet22()
      const [row] = treeSpendRowsOf([choice.spend, research.spend, rechoice.spend])
      expect(row.treeSpend).toEqual(add(choice.spend.cost, research.spend.cost))
      expect(row.totalSpend).toEqual(add(row.treeSpend, rechoice.spend.cost))
      expect(treeSpendRowsOf([rechoice.spend])[0].treeSpend).toEqual(ZERO_MONEY)
    }, [FORK_FIXTURE_SLICE])
  })

  it('records what the authority charged for the choice and the re-choice', () => {
    withFixtureTree(() => {
      const { choice, rechoice } = forkSpendsOnPlanet22()
      expect(choice.spend.cost).toEqual(chargedCostOf(choice.events))
      expect(rechoice.spend.cost).toEqual(chargedCostOf(rechoice.events))
      expect(rechoice.spend.boughtId).toBe('tech.drill_gear.fork.deep')
    }, [FORK_FIXTURE_SLICE])
  })

  it('files the choice under its lane and leaves the re-choice out of every lane row', () => {
    withFixtureTree(() => {
      const { choice, research, rechoice } = forkSpendsOnPlanet22()
      const rows = laneSpendRowsOf([choice.spend, research.spend, rechoice.spend])
      expect(rows).toEqual([
        {
          planetIndex: 22,
          lane: 'drill-gear',
          nodeSpend: add(choice.spend.cost, research.spend.cost),
          itemSpend: ZERO_MONEY,
        },
      ])
    }, [FORK_FIXTURE_SLICE])
  })
})
