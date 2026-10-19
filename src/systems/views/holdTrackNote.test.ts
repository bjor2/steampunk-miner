import { describe, expect, it } from 'vitest'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { createScriptedSession, dockInBay, typesOf } from '../authority/scriptedSession'
import { largestBandOreUnits } from '../economy/planetEconomy'
import { radiusForPlanet } from '../world/planetParams'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { HOLD_PAST_LARGEST_BAND_TEXT } from './trackNotes'
import { workshopRowsOf } from './workshopRows'

// The hold card (ticket 553, the Game Director's wording in the Producer's addendum on #553): it
// always shows the real number and price, "Hold: N ore (+X%)", and once the hold carries more
// than the planet's largest band a muted line says so; the purchase stays on sale.

/** A planet 1 rig with `holdStep` hold purchases, docked at the Upgrade bay with money to spare. */
function dockedWithHold(holdStep: number) {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e30'))
  session.submit(1, setUpgradeCommand('cargo_hold', holdStep))
  dockInBay(session, 2, 'upgrade')
  return session
}

function holdRowOf(holdStep: number) {
  const rows = workshopRowsOf(dockedWithHold(holdStep).state(), 'p1')
  const row = rows.find((candidate) => candidate.upgradeId === 'cargo_hold')
  if (row === undefined) throw new Error('the Upgrade bay has no hold row')
  return row
}

describe('hold card past the largest band (ticket 553)', () => {
  it("measures planet 1's largest band at 97 ore, Systems' 0.326 R", () => {
    expect(largestBandOreUnits(radiusForPlanet(1))).toBe(97)
    expect(largestBandOreUnits(radiusForPlanet(10))).toBe(234)
  })

  it('shows the real units and the next purchase as a share, "Hold: N ore (+X%)"', () => {
    expect(holdRowOf(0).levelText).toContain('Hold: 10 ore (+10%)')
    expect(holdRowOf(22).levelText).toContain('Hold: 81 ore (+')
  })

  it('adds no note while the hold carries no more than the largest band', () => {
    expect(holdRowOf(23).note).toBeNull()
  })

  it('adds the muted line once the hold carries more than the largest band', () => {
    const row = holdRowOf(24)
    expect(row.levelText).toContain('Hold: 98 ore (+')
    expect(row.note).toBe(HOLD_PAST_LARGEST_BAND_TEXT)
    expect(HOLD_PAST_LARGEST_BAND_TEXT).toBe(
      'More than this planet holds. Pays off on deeper planets.',
    )
  })

  it('keeps that purchase on sale and the authority sells it', () => {
    const row = holdRowOf(24)
    expect(row.buy.reason).toBeNull()
    expect(row.badge).toBeNull()
    const events = dockedWithHold(24).submit(3, buyUpgradeCommand('cargo_hold', CLICK_CHAIN))
    expect(typesOf(events)).toContain('UpgradePurchased')
  })
})
