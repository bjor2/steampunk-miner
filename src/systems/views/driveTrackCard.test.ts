import { describe, expect, it } from 'vitest'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { createScriptedSession, dockInBay, typesOf } from '../authority/scriptedSession'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { drillCutCapNote } from './trackNotes'
import { workshopRowsOf } from './workshopRows'

// Bjor's ruling on #723: the drive (the engine track) is its own price-only line with no max level
// (HS and VS on #551, ticket 553). The drill never sets travel, so no engine purchase is ever
// worth zero and the card shows no parity; the drill card says, from the cut caps' data, that a
// sideways cut is held to the drive's speed.

/**
 * Steps that cut band-1 rock in one sub-step a cell, the law's quantum: once ticket 553's
 * worth-zero drill. Drill power's purchase 106 costs only about 1.5e19 on #552's price.
 */
const STRONG_DRILL = { drill_power: 106, drill_tip: 600 }

/** A rig with `levels`, docked at the Upgrade bay with money to spare. */
function dockedSessionOf(levels: Record<string, number>) {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e60'))
  for (const [track, level] of Object.entries(levels)) {
    session.submit(1, setUpgradeCommand(track, level))
  }
  dockInBay(session, 2, 'upgrade')
  return session
}

function rowOf(levels: Record<string, number>, upgradeId: string) {
  const rows = workshopRowsOf(dockedSessionOf(levels).state(), 'p1')
  const row = rows.find((candidate) => candidate.upgradeId === upgradeId)
  if (row === undefined) throw new Error(`the Upgrade bay has no ${upgradeId} row`)
  return row
}

describe('drive track card (ticket 723)', () => {
  it.each([{}, STRONG_DRILL])('sells the next engine purchase with no note or badge', (levels) => {
    const row = rowOf(levels, 'engine')
    expect(row.badge).toBeNull()
    expect(row.buy.reason).toBeNull()
    expect(row.note).toBeNull()
  })

  it('shows the engine level with no parity beside it, however strong the drill', () => {
    expect(rowOf(STRONG_DRILL, 'engine').levelText).toBe(rowOf({}, 'engine').levelText)
    expect(rowOf(STRONG_DRILL, 'engine').levelText).not.toMatch(/cut|worth zero/)
  })

  it('buys an engine purchase beside a strong drill', () => {
    const session = dockedSessionOf(STRONG_DRILL)
    const events = session.submit(3, buyUpgradeCommand('engine', CLICK_CHAIN))
    expect(typesOf(events)).toContain('UpgradePurchased')
  })

  it('says under the drill power card that a sideways cut is capped by drive speed', () => {
    expect(drillCutCapNote()).toBe('Sideways capped by drive speed.')
    expect(rowOf({}, 'drill_power').note).toBe(drillCutCapNote())
  })
})
