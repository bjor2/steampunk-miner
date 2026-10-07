import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { CommandRule } from '../authority/commandRule'
import { rejectionOf } from '../authority/commandRule'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { cmp, fromCanonical, sub, toCanonical, ZERO_MONEY } from '../money'
import type { BotPurchase } from '../registries/botPurchases'
import { readSection, withSection, type SaveSection } from '../registries/saveSections'
import { buyUpgrades, hasPurchase, type ShoppingSituation } from './botShopping'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'
import { spendShareByPlanet } from './shopSpend'

// A fake slice sells two badges, one grade at a time, through a command it adds; the kernel bot
// buys them through the purchase seam without importing the slice (ticket 211).
declare module '../authority/authorityCommand' {
  interface CommandPayloads {
    'botprobe.buyBadge': { grade: number }
  }
}

const BADGE_PRICE = fromCanonical('5000')
const TOP_GRADE = 2

const BADGES: SaveSection<number> = {
  id: 'botprobe',
  version: 1,
  scope: 'player',
  initial: 0,
  problems: () => [],
  toPortable: (value) => value,
  ofPortable: (body) => body as number,
}

const BUY_BADGE: CommandRule<'botprobe.buyBadge'> = {
  fields: { grade: 'wholeNumber' },
  reject: (state, { playerId, payload }) => {
    if (payload.grade !== readSection(state, playerId, BADGES) + 1) {
      return rejectionOf('invalid_payload', 'not the next badge grade')
    }
    const isShort = cmp(state.players[playerId].wallet, BADGE_PRICE) < 0
    return isShort ? rejectionOf('money_short', 'badge costs more than the wallet') : null
  },
  apply: (state, { playerId, payload }) => chargeForBadge(state, playerId, payload.grade),
}

function chargeForBadge(state: AuthorityState, playerId: string, grade: number) {
  const player = state.players[playerId]
  const wallet = sub(player.wallet, BADGE_PRICE)
  const paid = { ...state, players: { ...state.players, [playerId]: { ...player, wallet } } }
  return {
    state: withSection(paid, playerId, BADGES, grade),
    events: [
      { type: 'MoneyChanged' as const, from: toCanonical(player.wallet), to: toCanonical(wallet) },
    ],
  }
}

const BADGE_PURCHASE: BotPurchase = {
  id: 'botprobe.badge',
  command: 'botprobe.buyBadge',
  payloadsToTry: (state, playerId) => {
    const owned = readSection(state, playerId, BADGES)
    return owned < TOP_GRADE ? [{ grade: owned + 1 }] : []
  },
  estimateCost: () => BADGE_PRICE,
  isAvailable: () => true,
}

const BADGE_SLICE: SliceDefinition = {
  id: 'botprobe',
  register: (r) => {
    r.saveSection(BADGES)
    r.commandRules({ 'botprobe.buyBadge': BUY_BADGE })
    r.botPurchase(BADGE_PURCHASE)
  },
}

/** The same badges, due ahead of the track levels (ticket 296). */
const DUE_BADGE_SLICE: SliceDefinition = {
  id: 'botprobe',
  register: (r) => {
    r.saveSection(BADGES)
    r.commandRules({ 'botprobe.buyBadge': BUY_BADGE })
    r.botPurchase({ ...BADGE_PURCHASE, duePayloadsOf: BADGE_PURCHASE.payloadsToTry })
  },
}

/** Badges as before, and a due medal the bot reckons at more than any wallet here holds. */
const DEAR_MEDAL_SLICE: SliceDefinition = {
  id: 'botprobe',
  register: (r) => {
    r.saveSection(BADGES)
    r.commandRules({ 'botprobe.buyBadge': BUY_BADGE })
    r.botPurchase(BADGE_PURCHASE)
    r.botPurchase({
      ...BADGE_PURCHASE,
      id: 'botprobe.medal',
      estimateCost: () => fromCanonical('1e30'),
      duePayloadsOf: () => [{ grade: 1 }],
    })
  },
}

/** The bot docked at planet 2's Upgrade bay with `wallet` to spend. */
function botAtUpgradeBay(wallet: string): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: 2 } })
  session.submit({ type: 'debug.setMoney', payload: { amount: wallet } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

function situationOf(session: BotSession): ShoppingSituation {
  const site = dockSiteOfPlanet(session.state().planet)!
  return {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    isCoreTheGoal: false,
    gunPolicy: 'never',
    hasMetBlastTile: false,
    restockSize: 1,
    chainPolicy: 'click',
  }
}

function commandTypesOf(session: BotSession): string[] {
  return session.commands().map((command) => command.type)
}

describe('bot: slice purchases', () => {
  it('buys a registered slice purchase after the kernel purchases, through its command', () => {
    withRegistrations([BADGE_SLICE], () => {
      const session = botAtUpgradeBay('1e9')
      buyUpgrades(session, situationOf(session))
      const types = commandTypesOf(session)
      expect(types.filter((type) => type === 'botprobe.buyBadge')).toHaveLength(TOP_GRADE)
      expect(types.lastIndexOf('buyUpgrade')).toBeLessThan(types.indexOf('botprobe.buyBadge'))
      expect(readSection(session.state(), 'p1', BADGES)).toBe(TOP_GRADE)
    })
  })

  it("puts the slice purchases' estimates in the spend-share diagnostic", () => {
    withRegistrations([BADGE_SLICE], () => {
      const session = botAtUpgradeBay('1e9')
      const spends = buyUpgrades(session, situationOf(session))
      const [planet] = spendShareByPlanet(spends)
      expect(planet.planetIndex).toBe(2)
      expect(planet.sliceSpend).toEqual(fromCanonical('10000'))
      expect(cmp(planet.sliceShare, ZERO_MONEY)).toBe(1)
      expect(cmp(planet.totalSpend, planet.sliceSpend)).toBe(1)
    })
  })

  it('records each kernel purchase at what the wallet paid', () => {
    withRegistrations([BADGE_SLICE], () => {
      const session = botAtUpgradeBay('1e9')
      const before = session.state().players.p1.wallet
      const spends = buyUpgrades(session, situationOf(session))
      const [planet] = spendShareByPlanet(spends)
      expect(planet.totalSpend).toEqual(sub(before, session.state().players.p1.wallet))
    })
  })

  it('keeps the next service paid for: a badge that would leave less is not bought', () => {
    const session = botAtUpgradeBay('1e9')
    const situation = situationOf(session)
    withRegistrations([], () => buyUpgrades(session, situation))
    session.submit({ type: 'debug.setMoney', payload: { amount: toCanonical(BADGE_PRICE) } })
    withRegistrations([BADGE_SLICE], () => buyUpgrades(session, situation))
    expect(commandTypesOf(session)).not.toContain('botprobe.buyBadge')
  })

  it('makes the Upgrade bay worth a visit when only a slice purchase pays', () => {
    const session = botAtUpgradeBay('1e9')
    const situation = situationOf(session)
    withRegistrations([], () => buyUpgrades(session, situation))
    expect(withRegistrations([], () => hasPurchase(session, situation))).toBe(false)
    expect(withRegistrations([BADGE_SLICE], () => hasPurchase(session, situation))).toBe(true)
  })

  it('buys nothing beyond the kernel purchases while no slice registered one', () => {
    withRegistrations([], () => {
      const session = botAtUpgradeBay('1e9')
      const spends = buyUpgrades(session, situationOf(session))
      expect(spends.every((spend) => spend.source === 'kernel')).toBe(true)
      expect(spendShareByPlanet(spends)[0].sliceSpend).toEqual(ZERO_MONEY)
    })
  })
})

describe('bot: slice purchases due ahead of the tracks (ticket 296)', () => {
  it('buys a due slice purchase before any track level', () => {
    withRegistrations([DUE_BADGE_SLICE], () => {
      const session = botAtUpgradeBay('1e9')
      const spends = buyUpgrades(session, situationOf(session))
      const types = commandTypesOf(session)
      expect(types.filter((type) => type === 'botprobe.buyBadge')).toHaveLength(TOP_GRADE)
      expect(types.indexOf('botprobe.buyBadge')).toBeLessThan(types.indexOf('buyUpgrade'))
      expect(spends[0]).toMatchObject({ source: 'slice', purchaseId: 'botprobe.badge' })
    })
  })

  it('saves for a due purchase it cannot pay: no track level and no other slice purchase', () => {
    withRegistrations([DEAR_MEDAL_SLICE], () => {
      const session = botAtUpgradeBay('1e9')
      const before = session.state().players.p1.wallet
      expect(buyUpgrades(session, situationOf(session))).toEqual([])
      expect(commandTypesOf(session)).not.toContain('buyUpgrade')
      expect(commandTypesOf(session)).not.toContain('botprobe.buyBadge')
      expect(session.state().players.p1.wallet).toEqual(before)
    })
  })

  it('skips the Upgrade bay while it saves for a due purchase', () => {
    const session = botAtUpgradeBay('1e9')
    const situation = situationOf(session)
    expect(withRegistrations([BADGE_SLICE], () => hasPurchase(session, situation))).toBe(true)
    expect(withRegistrations([DEAR_MEDAL_SLICE], () => hasPurchase(session, situation))).toBe(false)
  })
})
