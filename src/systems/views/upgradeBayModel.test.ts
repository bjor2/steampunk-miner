import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { buyCasingGradeCommand, buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { selectUpgradeBayModel, upgradeBayStartFocus } from './upgradeBayModel'
import { statsOfTrack } from './workshopRows'

type Session = ReturnType<typeof createScriptedSession>

function atUpgradeBay(money = '0'): Session {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand(money))
  dockInBay(session, 2, 'upgrade')
  return session
}

function upgradeBayOf(session: Session, focusedId: string | null = null) {
  return selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId,
  })
}

function eventsAfter(session: Session, run: () => void) {
  const before = session.events().length
  run()
  return session.events().slice(before)
}

const buyIdOf = (upgradeId: UpgradeId) => UI_ID_TEMPLATES.workshopUpgradeBuy(upgradeId)

describe('upgrade bay model', () => {
  it('lists the six tracks in #7 order, each with its icon', () => {
    const tracks = upgradeBayOf(atUpgradeBay()).tracks
    expect(tracks.map((row) => row.upgradeId)).toEqual(UPGRADE_IDS)
    expect(tracks.map((row) => row.iconId)).toEqual(UPGRADE_IDS.map((id) => `icon-track-${id}`))
  })

  it('previews each upgrade as the purchase then logs it: cost and statsAfter', () => {
    const session = atUpgradeBay('1e6')
    for (const upgradeId of UPGRADE_IDS) {
      const row = upgradeBayOf(session).tracks.find((r) => r.upgradeId === upgradeId)!
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
    const session = atUpgradeBay()
    const row = upgradeBayOf(session).tracks[0]
    expect(row.buyState).toBe('money_short')
    expect(row.buy.reason).toBe('money_short')
    const [refusal] = eventsAfter(session, () =>
      session.submit(3, buyUpgradeCommand(row.upgradeId)),
    )
    expect(refusal).toMatchObject({ type: 'CommandRejected', reason: 'money_short' })
  })

  it('shows the Casing row with grade G -> G+1, the next cost, and a Buy that submits BuyCasingGrade', () => {
    const casing = upgradeBayOf(atUpgradeBay('100')).casing
    expect(casing).toMatchObject({
      iconId: 'icon-casing',
      grade: 1,
      gradeAfter: 2,
      gradeText: '1 → 2',
      cost: { text: '48', exact: '4.8e+1' },
      buyState: 'affordable',
    })
    expect(casing.buy).toMatchObject({
      id: UI_IDS.upgradebayCasingBuy,
      action: { kind: 'submit', intent: buyCasingGradeCommand() },
      reason: null,
    })
  })

  it('reads the next casing price after a buy, and money_short when the wallet is short', () => {
    const session = atUpgradeBay('100')
    session.submit(3, buyCasingGradeCommand())
    const casing = upgradeBayOf(session).casing
    expect(casing).toMatchObject({ grade: 2, gradeText: '2 → 3', cost: { exact: '6e+1' } })
    expect(casing.buy.reason).toBe('money_short')
  })

  it('carries wrong_bay on the Casing, track and repair buttons when docked at the Sell bay', () => {
    const session = createScriptedSession()
    session.submit(1, grantMoneyCommand('1e6'))
    dockInBay(session, 2, 'sell')
    const model = upgradeBayOf(session)
    expect(model.casing.buy.reason).toBe('wrong_bay')
    expect(model.tracks.every((row) => row.buy.reason === 'wrong_bay')).toBe(true)
  })

  it('shows the quick action as a disabled wrong_bay sign that focus never lands on', () => {
    const model = upgradeBayOf(atUpgradeBay('100'))
    expect(model.quickService).toMatchObject({
      id: UI_IDS.upgradebayQuickService,
      reason: 'wrong_bay',
    })
    expect(model.focusStops.map((stop) => stop.id)).not.toContain(UI_IDS.upgradebayQuickService)
  })

  it('orders focus tracks, casing, repair, footer and starts on the first track', () => {
    const model = upgradeBayOf(atUpgradeBay())
    expect([...new Set(model.focusStops.map((stop) => stop.panel))]).toEqual([
      'tracks',
      'casing',
      'repair',
      'footer',
    ])
    expect(upgradeBayStartFocus(model)).toBe(buyIdOf(UPGRADE_IDS[0]))
  })

  it('previews the focused track and the visual tier its purchase crosses into', () => {
    const session = atUpgradeBay()
    session.submit(3, setUpgradeCommand('boiler', 7))
    expect(upgradeBayOf(session, buyIdOf('engine')).preview).toEqual({
      highlight: 'engine',
      visualTier: 2,
    })
    expect(upgradeBayOf(session).visualTier).toBe(1)
  })

  it('keeps the visual tier unchanged with the Casing row focused: casing is not a hull part', () => {
    const session = atUpgradeBay('1e6')
    session.submit(3, setUpgradeCommand('boiler', 7))
    expect(upgradeBayOf(session, UI_IDS.upgradebayCasingBuy).preview).toEqual({
      highlight: null,
      visualTier: 1,
    })
  })

  it('never changes the state digest while focus moves over every row', () => {
    const session = atUpgradeBay('1e6')
    const before = stateDigest(session.state())
    for (const stop of upgradeBayOf(session).focusStops) upgradeBayOf(session, stop.id)
    expect(stateDigest(session.state())).toBe(before)
  })

  it('reads the header as the Upgrade bay', () => {
    expect(upgradeBayOf(atUpgradeBay()).header).toMatchObject({
      bay: 'upgrade',
      bayName: 'Upgrade bay',
    })
  })
})
