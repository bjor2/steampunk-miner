import { describe, expect, it } from 'vitest'
import { createScriptedSession, mineTile, surfaceOreTiles } from '../authority/scriptedSession'
import { setHullCommand, setEnergyCommand, teleportToDockCommand } from '../vehicle/vehicleCommands'
import {
  dockCommand,
  buyUpgradeCommand,
  sellCargoCommand,
  travelCommand,
} from '../platform/platformCommands'
import { grantMoneyCommand, setCoreFragmentsCommand } from '../startScenarioCommands'
import { add, fromCanonical, toCanonical } from '../money'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { formatAmount } from '../displayAmount'
import { selectPlatformModel } from './platformModel'
import { statsOfTrack } from './workshopRows'

const canonical = (text: string) => toCanonical(fromCanonical(text))

function dockedSession() {
  const session = createScriptedSession()
  session.submit(1, dockCommand())
  return session
}

function platformOf(session: ReturnType<typeof createScriptedSession>, isTravelArmed = false) {
  return selectPlatformModel(session.state(), 'p1', {
    isTravelArmed,
    isQuickServiceHighlighted: false,
  })
}

function eventsAfter(session: ReturnType<typeof createScriptedSession>, run: () => void) {
  const before = session.events().length
  run()
  return session.events().slice(before)
}

describe('platform model', () => {
  it('lists a row per held tier and values Sell all exactly as the sale pays (#33 acceptance 8)', () => {
    const session = createScriptedSession()
    surfaceOreTiles(4).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
    session.submit(400, teleportToDockCommand())
    const model = platformOf(session)
    expect(model.shop.rows.length).toBeGreaterThan(0)
    expect(model.shop.rows.every((row) => row.family === 'mixed' && row.tier > 0)).toBe(true)
    const [sold] = eventsAfter(session, () => session.submit(401, sellCargoCommand('all'))).filter(
      (event) => event.type === 'ResourceSold',
    )
    expect(sold.type === 'ResourceSold' && sold.value).toBe(model.shop.sellAllValue.exact)
  })

  it('totals the quick action as cargo value plus repair plus recharge at current prices', () => {
    const session = dockedSession()
    session.submit(2, setHullCommand('50'))
    session.submit(2, setEnergyCommand('100'))
    const model = platformOf(session)
    const expected = add(
      fromCanonical(model.workshop.repairCost.exact),
      fromCanonical(model.charging.cost.exact),
    )
    expect(model.footer.quickTotal.exact).toBe(toCanonical(expected))
    expect(model.workshop.repairCost.exact).toBe(canonical('5.625'))
    expect(model.charging.cost.exact).toBe(canonical('2.25'))
    expect(model.charging.price.text).toBe('0.045')
  })

  it('previews each upgrade as the purchase then logs it: cost and statsAfter', () => {
    const session = dockedSession()
    session.submit(2, grantMoneyCommand('1e6'))
    for (const upgradeId of UPGRADE_IDS) {
      const row = platformOf(session).workshop.upgrades.find((r) => r.upgradeId === upgradeId)!
      const tick = session.state().tick
      const events = eventsAfter(session, () => session.submit(tick, buyUpgradeCommand(upgradeId)))
      const purchase = events.find((event) => event.type === 'UpgradePurchased')
      if (purchase?.type !== 'UpgradePurchased') throw new Error(`no purchase of ${upgradeId}`)
      expect(row.cost.exact).toBe(purchase.cost)
      for (const stat of statsOfTrack(upgradeId)) {
        expect(row.effectAfter.stats[stat].exact).toBe(purchase.statsAfter[stat])
      }
    }
  })

  it('marks an unaffordable row money_short, the reason the authority refuses it with', () => {
    const session = dockedSession()
    const row = platformOf(session).workshop.upgrades[0]
    expect(row.buyState).toBe('money_short')
    expect(row.buy.reason).toBe('money_short')
    const [refusal] = eventsAfter(session, () =>
      session.submit(2, buyUpgradeCommand(row.upgradeId)),
    )
    expect(refusal).toMatchObject({ type: 'CommandRejected', reason: 'money_short' })
  })

  it('says core_short at 62 fragments and ready at 63 with 60.8 money', () => {
    const session = dockedSession()
    session.submit(2, setCoreFragmentsCommand(62))
    session.submit(2, grantMoneyCommand('60.8'))
    expect(platformOf(session).footer.travel).toMatchObject({
      state: 'core_short',
      fragmentsText: '62 / 63',
    })
    session.submit(3, setCoreFragmentsCommand(63))
    const travel = platformOf(session).footer.travel!
    expect(travel).toMatchObject({ state: 'ready', fee: { text: '60.75' } })
  })

  it('submits Travel only from the armed button', () => {
    const session = dockedSession()
    expect(platformOf(session, false).footer.travel?.button.action).toEqual({ kind: 'armTravel' })
    expect(platformOf(session, true).footer.travel?.button.action).toEqual({
      kind: 'submit',
      intent: travelCommand(2),
    })
  })

  it('puts the end-of-slice card in place of travel on planet 2', () => {
    const session = dockedSession()
    session.submit(2, setCoreFragmentsCommand(63))
    session.submit(2, grantMoneyCommand('60.8'))
    session.submit(3, travelCommand(2))
    const footer = platformOf(session).footer
    expect(footer.travel).toBeNull()
    expect(footer.hasEndCard).toBe(true)
  })

  it('shows huge money through the formatter with its exact value beside it', () => {
    for (const amount of ['1e30', '1e400']) {
      const session = dockedSession()
      session.submit(2, grantMoneyCommand(amount))
      const { money } = platformOf(session).header
      expect(money.text).toBe(formatAmount(fromCanonical(amount)))
      expect(money.text).not.toContain('NaN')
      expect(money.exact).toBe(canonical(amount))
    }
  })

  it('reads the header: planet, core bay against the need, platform state', () => {
    const session = dockedSession()
    session.submit(2, setCoreFragmentsCommand(17))
    expect(platformOf(session).header).toMatchObject({
      planet: 1,
      coreBayText: '17 / 63',
      platformState: 'outpost',
    })
  })

  it('orders focus by panel and starts nowhere it cannot reach', () => {
    const stops = platformOf(dockedSession()).focusStops
    expect(stops.map((stop) => stop.id)).toContain('platform-quick-service')
    expect([...new Set(stops.map((stop) => stop.panel))]).toEqual([
      'shop',
      'workshop',
      'charging',
      'footer',
    ])
  })
})
