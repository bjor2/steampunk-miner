import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../authority/authorityCommand'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { serviceReserveOf } from '../authority/serviceReserve'
import { cmp } from '../money'
import { DEFAULT_CHAIN_POLICY, type ChainPolicy } from './botChains'
import { buyUpgrades } from './botShopping'
import { buyDueSlicePurchases } from './botSlicePurchases'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'

const WORLD_SEED = 83921

/** The bot docked at the Upgrade bay of planet `planetIndex` with `money`. */
function botAtUpgradeBayOn(planetIndex: number, money: string): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: money } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

function shop(session: BotSession, chainPolicy: ChainPolicy): void {
  const site = dockSiteOfPlanet(session.state().planet)!
  buyUpgrades(session, {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    isCoreTheGoal: true,
    gunPolicy: 'never',
    hasMetBlastTile: false,
    restockSize: 1,
    chainPolicy,
  })
}

type StepCommand = AuthorityCommand<'buyUpgrade'>

function stepsBought(session: BotSession): StepCommand[] {
  return session.commands().filter((command): command is StepCommand => {
    return command.type === 'buyUpgrade'
  })
}

/**
 * A rack with empty slots on planet 7: a reserve the bot's own service money never keeps. The
 * bot already owns what a slice has due here (ticket 296, an extractor), so the visit is the
 * track steps alone.
 */
function botWithEmptyRack(policy: ChainPolicy): BotSession {
  const session = botAtUpgradeBayOn(7, '1e12')
  buyDueSlicePurchases(session)
  session.submit({ type: 'debug.setMoney', payload: { amount: '2e6' } })
  session.submit({ type: 'debug.setCharges', payload: { size: 1, carried: 0, slotLevel: 2 } })
  shop(session, policy)
  return session
}

describe('bot: holding the buy button (ticket 226)', () => {
  it('clicks every step until the re-baseline turns holding on', () => {
    expect(DEFAULT_CHAIN_POLICY).toBe('click')
    const session = botAtUpgradeBayOn(3, '2e5')
    shop(session, DEFAULT_CHAIN_POLICY)
    expect(stepsBought(session).every((step) => step.payload.chain === 0)).toBe(true)
  })

  it('holds the steps it buys in a row on one track as one chain, and a new track as another', () => {
    const session = botAtUpgradeBayOn(3, '2e5')
    shop(session, 'hold')
    const steps = stepsBought(session)
    expect(new Set(steps.map((step) => step.payload.upgradeId)).size).toBeGreaterThan(1)
    expect(steps.every((step) => step.payload.chain > 0)).toBe(true)
    steps.slice(1).forEach((step, index) => {
      const isSameTrack = step.payload.upgradeId === steps[index].payload.upgradeId
      expect(step.payload.chain === steps[index].payload.chain).toBe(isSameTrack)
    })
  })

  it('buys what clicking buys when no service is due', () => {
    const held = botAtUpgradeBayOn(3, '2e5')
    const clicked = botAtUpgradeBayOn(3, '2e5')
    shop(held, 'hold')
    shop(clicked, 'click')
    expect(held.vehicle().levels).toEqual(clicked.vehicle().levels)
  })

  it('stops at the service reserve while holding, where clicking spends into it', () => {
    const held = botWithEmptyRack('hold')
    const reserve = serviceReserveOf(held.state(), 'p1')
    expect(cmp(held.state().players.p1.wallet, reserve)).toBeGreaterThanOrEqual(0)
    expect(held.events().some((event) => event.type === 'CommandRejected')).toBe(false)
    const clicked = botWithEmptyRack('click')
    expect(cmp(clicked.state().players.p1.wallet, reserve)).toBeLessThan(0)
  })
})
