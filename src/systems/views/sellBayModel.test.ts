import { describe, expect, it } from 'vitest'
import { repairCostOf } from '../authority/platformServices'
import { withVehicle, type AuthorityState } from '../authority/authorityState'
import { digTenMetresUntil } from '../authority/casingDigFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  dockInBay,
  mineTile,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import { formatAmount } from '../displayAmount'
import { add, fromCanonical, toCanonical } from '../money'
import { dockCommand, sellCargoCommand, travelCommand } from '../platform/platformCommands'
import { grantMoneyCommand, setCoreFragmentsCommand } from '../startScenarioCommands'
import { setEnergyCommand, setHullCommand, teleportToDockCommand } from '../vehicle/vehicleCommands'
import { SELL_BAY_START_FOCUS, selectSellBayModel } from './sellBayModel'

type Session = ReturnType<typeof createScriptedSession>

const canonical = (text: string) => toCanonical(fromCanonical(text))

function dockedSession(): Session {
  const session = createScriptedSession()
  session.submit(1, dockCommand('sell'))
  return session
}

function sellBayOf(session: Session, isTravelArmed = false) {
  return selectSellBayModel(session.state(), 'p1', {
    isTravelArmed,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
}

function eventsAfter(session: Session, run: () => void) {
  const before = session.events().length
  run()
  return session.events().slice(before)
}

describe('sell bay model', () => {
  it('lists a row per held tier and values Sell all exactly as the sale pays (#33 acceptance 8)', () => {
    const session = createScriptedSession()
    surfaceOreTiles(4).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
    session.submit(400, teleportToDockCommand('sell'))
    const model = sellBayOf(session)
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
    const model = sellBayOf(session)
    const expected = add(
      repairCostOf(session.state(), 'p1'),
      fromCanonical(model.charging.cost.exact),
    )
    expect(model.quickService.total.exact).toBe(toCanonical(expected))
    expect(model.charging.cost.exact).toBe(canonical('2.25'))
    expect(model.charging.price.text).toBe('0.045')
  })

  it('focuses "Sell, repair and recharge" first and lists it as the first stop', () => {
    const model = sellBayOf(dockedSession())
    expect(SELL_BAY_START_FOCUS).toBe(model.quickService.button.id)
    expect(model.focusStops[0].id).toBe(SELL_BAY_START_FOCUS)
  })

  it('offers no upgrade, casing or repair button: those are the Upgrade bay', () => {
    const ids = sellBayOf(dockedSession()).buttons.map((button) => button.id)
    expect(ids.filter((id) => /upgrade|casing|repair/.test(id))).toEqual([])
  })

  it('carries wrong_bay on its buttons when the vehicle is docked at the Upgrade bay', () => {
    const session = createScriptedSession()
    surfaceOreTiles(2).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
    session.submit(200, teleportToDockCommand('upgrade'))
    const model = sellBayOf(session)
    expect(model.shop.sellAll.reason).toBe('wrong_bay')
    // The quick action works at both shops (#170).
    expect(model.quickService.button.reason).toBeNull()
  })

  it('says core_short at 62 fragments and ready at 63 with 60.8 money', () => {
    const session = dockedSession()
    session.submit(2, setCoreFragmentsCommand(62))
    session.submit(2, grantMoneyCommand('60.8'))
    expect(sellBayOf(session).footer.travel).toMatchObject({
      state: 'core_short',
      fragmentsText: '62 / 63',
    })
    session.submit(3, setCoreFragmentsCommand(63))
    const travel = sellBayOf(session).footer.travel!
    expect(travel).toMatchObject({ state: 'ready', fee: { text: '60.75' } })
  })

  it('submits Travel only from the armed button', () => {
    const session = dockedSession()
    expect(sellBayOf(session, false).footer.travel?.button.action).toEqual({ kind: 'armTravel' })
    expect(sellBayOf(session, true).footer.travel?.button.action).toEqual({
      kind: 'submit',
      intent: travelCommand(2),
    })
  })

  it('puts the end-of-slice card in place of travel on planet 2', () => {
    const session = dockedSession()
    session.submit(2, setCoreFragmentsCommand(63))
    session.submit(2, grantMoneyCommand('60.8'))
    session.submit(3, travelCommand(2))
    const footer = sellBayOf(session).footer
    expect(footer.travel).toBeNull()
    expect(footer.hasEndCard).toBe(true)
  })

  it('shows huge money through the formatter with its exact value beside it', () => {
    for (const amount of ['1e30', '1e400']) {
      const session = dockedSession()
      session.submit(2, grantMoneyCommand(amount))
      const { money } = sellBayOf(session).header
      expect(money.text).toBe(formatAmount(fromCanonical(amount)))
      expect(money.text).not.toContain('NaN')
      expect(money.exact).toBe(canonical(amount))
    }
  })

  it('reads the header: bay, planet, core bay against the need, platform state', () => {
    const session = dockedSession()
    session.submit(2, setCoreFragmentsCommand(17))
    expect(sellBayOf(session).header).toMatchObject({
      bay: 'sell',
      bayName: 'Sell bay',
      planet: 1,
      coreBay: { text: '17 / 63', exact: '17', permille: 269 },
      platformState: 'outpost',
    })
  })

  it('shows no lining bill panel while the vehicle has no bill', () => {
    expect(sellBayOf(dockedSession()).lining).toBeNull()
  })

  it('shows the visit lining bill, what its sales paid and what leaving would forgive (#128)', () => {
    const { session, end } = digTenMetresUntil(1, '0')
    surfaceOreTiles(1).forEach((tile) => mineTile(session, end + 100, tile))
    dockInBay(session, end + 200, 'sell')
    const billed = toCanonical(session.vehicle().liningBill)
    expect(sellBayOf(session).lining).toMatchObject({
      billed: { exact: billed },
      paid: { exact: '0e+0' },
      forgiven: { exact: '0e+0' },
    })
    session.submit(end + 200, sellCargoCommand('all'))
    expect(sellBayOf(session).lining).toMatchObject({
      billed: { exact: billed },
      paid: { exact: billed },
      forgiven: { exact: '0e+0' },
    })
  })

  it('shows what a sale could not pay as forgiven on leaving, once the visit has had a payout', () => {
    const session = continueScriptedSession(withBillOf(sessionWithOre(1).state(), '25'))
    session.submit(500, teleportToDockCommand('sell'))
    session.submit(501, sellCargoCommand('all'))
    expect(sellBayOf(session).lining).toMatchObject({
      billed: { exact: canonical('25') },
      paid: { exact: canonical('10') },
      forgiven: { exact: canonical('15') },
    })
  })
})

/** `units` surface ore (tier 1, worth 10 each) in the hold. */
function sessionWithOre(units: number): Session {
  const session = createScriptedSession()
  surfaceOreTiles(units).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
  return session
}

/** `bill` of lining on p1's vehicle, more than any short dig lays at today's `k_casing`. */
function withBillOf(state: AuthorityState, bill: string): AuthorityState {
  const vehicle = { ...state.players.p1.vehicle, liningBill: fromCanonical(bill) }
  return withVehicle(state, 'p1', vehicle)
}
