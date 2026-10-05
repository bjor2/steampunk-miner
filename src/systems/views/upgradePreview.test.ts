import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import { ECONOMY } from '../economy/economy'
import type { UpgradeId } from '../economy/economyDefinition'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { selectUpgradeBayModel } from './upgradeBayModel'
import { gaugeTicksOf } from './upgradePreview'

type Session = ReturnType<typeof createScriptedSession>

const [T2, T3] = ECONOMY.visualTiers.slice(1).map((threshold) => threshold.minTotalLevel)

function atUpgradeBay(levels: Partial<Record<UpgradeId, number>> = {}): Session {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e6'))
  Object.entries(levels).forEach(([id, level]) => session.submit(1, setUpgradeCommand(id, level)))
  dockInBay(session, 2, 'upgrade')
  return session
}

function previewOf(
  session: Session,
  focusedId: string | null = null,
  installingUpgradeId: UpgradeId | null = null,
) {
  return selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId,
    installingUpgradeId,
  }).preview
}

const buyIdOf = (upgradeId: UpgradeId) => UI_ID_TEMPLATES.workshopUpgradeBuy(upgradeId)

describe('upgrade bay preview', () => {
  it('reads the T2 and T3 thresholds of economy.json as level sums 8 and 20', () => {
    expect([T2, T3]).toEqual([8, 20])
  })

  it('gauges the levels owned since the current tier against the levels to the next', () => {
    const awayFromRows = UI_IDS.platformUndock
    expect(previewOf(atUpgradeBay({ boiler: 3 }), awayFromRows).gauge).toEqual({
      owned: 3,
      span: 8,
      pending: 0,
    })
    expect(previewOf(atUpgradeBay({ boiler: 8, hull: 4 }), awayFromRows).gauge).toMatchObject({
      owned: 4,
      span: 12,
    })
  })

  it('has no next tier to gauge toward at tier 3', () => {
    const preview = previewOf(atUpgradeBay({ boiler: 20, engine: 2 }))
    expect(preview).toMatchObject({ ownedTier: 3, gauge: { owned: 2, span: null } })
  })

  it('shows the pending tick and the stats before and after with a track focused', () => {
    const session = atUpgradeBay()
    const preview = previewOf(session, buyIdOf('cargo_hold'))
    const row = selectUpgradeBayModel(session.state(), 'p1', {
      isTravelArmed: false,
      isQuickServiceHighlighted: false,
      focusedId: null,
      installingUpgradeId: null,
    }).tracks.find((track) => track.upgradeId === 'cargo_hold')!
    expect(preview.gauge.pending).toBe(1)
    expect(preview.highlight).toBe('cargo_hold')
    expect(preview.effect).toEqual({ before: row.effectBefore, after: row.effectAfter })
  })

  it('ghosts the next tier when the focused buy crosses T2, and keeps the owned shape solid', () => {
    const preview = previewOf(atUpgradeBay({ boiler: 7 }), buyIdOf('engine'))
    expect(preview).toMatchObject({ visualTier: 2, ownedTier: 1, ghostTier: 2 })
  })

  it('ghosts tier 3 when the focused buy crosses T3', () => {
    const preview = previewOf(atUpgradeBay({ boiler: 19 }), buyIdOf('hull'))
    expect(preview).toMatchObject({ visualTier: 3, ownedTier: 2, ghostTier: 3 })
  })

  it('shows no ghost when the focused buy stays inside the tier', () => {
    const preview = previewOf(atUpgradeBay({ boiler: 5 }), buyIdOf('engine'))
    expect(preview).toMatchObject({ visualTier: 1, ownedTier: 1, ghostTier: null })
  })

  it('shows the next casing grade as a lining swatch with the Casing row focused, the vehicle as it is', () => {
    const preview = previewOf(atUpgradeBay({ boiler: 7 }), UI_IDS.upgradebayCasingBuy)
    expect(preview).toMatchObject({
      liningGrade: 2,
      highlight: null,
      visualTier: 1,
      ghostTier: null,
      gauge: { owned: 7, span: 8, pending: 0 },
      effect: null,
    })
  })

  it('opens on the first track, so the screen starts with its pending tick shown', () => {
    expect(previewOf(atUpgradeBay())).toMatchObject({
      highlight: 'drill_power',
      gauge: { pending: 1 },
    })
  })

  it('shows no lining swatch with a track focused', () => {
    expect(previewOf(atUpgradeBay(), buyIdOf('hull')).liningGrade).toBeNull()
  })

  it('reports the part being installed, and the new tier once the buy is through', () => {
    const session = atUpgradeBay({ boiler: 7 })
    session.submit(3, buyUpgradeCommand('engine'))
    expect(previewOf(session, null, 'engine')).toMatchObject({
      installing: 'engine',
      ownedTier: 2,
      gauge: { owned: 0, span: 12 },
    })
  })

  it('never changes the state digest while focus moves over every control', () => {
    const session = atUpgradeBay({ boiler: 7 })
    const before = stateDigest(session.state())
    const stops = selectUpgradeBayModel(session.state(), 'p1', {
      isTravelArmed: false,
      isQuickServiceHighlighted: false,
      focusedId: null,
      installingUpgradeId: null,
    }).focusStops
    stops.forEach((stop) => previewOf(session, stop.id))
    expect(stateDigest(session.state())).toBe(before)
  })

  it('draws one gauge tick per level to the next tier: owned, then the pending buy, then open', () => {
    expect(gaugeTicksOf({ owned: 2, span: 5, pending: 1 })).toEqual([
      'owned',
      'owned',
      'pending',
      'open',
      'open',
    ])
  })

  it('draws no ticks at the last tier, whose levels never end', () => {
    expect(gaugeTicksOf({ owned: 40, span: null, pending: 1 })).toEqual([])
  })
})
