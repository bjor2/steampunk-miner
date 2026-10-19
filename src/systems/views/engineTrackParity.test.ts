import { describe, expect, it } from 'vitest'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { createScriptedSession, dockInBay, typesOf } from '../authority/scriptedSession'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { engineWorthZeroText, workshopRowsOf } from './workshopRows'

// No max level on the engine (HS and VS on #551, ticket 553): the card always sells the next
// purchase for money, shows the ratio of the top speed to k times the drill's cut speed in the
// planet's hardest band (#418's band), and says plainly when that purchase is worth zero.

/**
 * Steps that cut band-1 rock in one sub-step a cell, the law's quantum. Drill power's purchase 106
 * is the first at or past the old stored 2000 since #552, and still costs only about 1.5e19.
 */
const STRONG_DRILL = { drill_power: 106, drill_tip: 600 }

/**
 * Steps whose k times cut passes the 6 m/s engine in planet 1's band 1 (8.28) but not band 5
 * (2.04): drill power's purchase 7 is the first at or past the old stored 100 since #552.
 */
const BAND_ONE_DRILL = { drill_power: 7, drill_tip: 30 }

interface RowModules {
  createScriptedSession: typeof createScriptedSession
  dockInBay: typeof dockInBay
  workshopRowsOf: typeof workshopRowsOf
}

/** A rig with `levels`, docked at the Upgrade bay with money to spare: drill power's purchase
 * 106 costs about 1.5e19 on #552's per-purchase price. */
function dockedSessionOf(modules: RowModules, levels: Record<string, number>) {
  const session = modules.createScriptedSession()
  session.submit(1, grantMoneyCommand('1e60'))
  for (const [track, level] of Object.entries(levels)) {
    session.submit(1, setUpgradeCommand(track, level))
  }
  modules.dockInBay(session, 2, 'upgrade')
  return session
}

/** The track rows for a rig with `levels`, docked at the Upgrade bay with money to spare. */
function rowsOf(modules: RowModules, levels: Record<string, number>) {
  return modules.workshopRowsOf(dockedSessionOf(modules, levels).state(), 'p1')
}

function engineRowOf(modules: RowModules, levels: Record<string, number>) {
  const row = rowsOf(modules, levels).find((candidate) => candidate.upgradeId === 'engine')
  if (row === undefined) throw new Error('the Upgrade bay has no engine row')
  return row
}

describe('engine card parity with no max level (ticket 553)', () => {
  const modules = { createScriptedSession, dockInBay, workshopRowsOf }

  it('offers its buy with a starting drill, whose k times cut stays under the top speed', () => {
    const row = engineRowOf(modules, {})
    expect(row.badge).toBeNull()
    expect(row.buy.reason).toBeNull()
    expect(row.levelText).not.toContain(engineWorthZeroText())
  })

  it('shows the ratio of the top speed to 1.5 times the cut in the hardest band', () => {
    expect(engineRowOf(modules, {}).levelText).toMatch(/top speed \d+\.\d\d× of 1\.5× cut/)
  })

  // #418 (GD option a): an engine step still speeds travel in the deeper bands, so it is no zero.
  it('counts the step while the drill sets travel in band 1 but not the hardest band', () => {
    const row = engineRowOf(modules, BAND_ONE_DRILL)
    expect(row.buy.reason).toBeNull()
    expect(row.levelText).not.toContain(engineWorthZeroText())
  })

  it('says the next purchase is worth zero once the drill outruns the engine in every band', () => {
    const row = engineRowOf(modules, STRONG_DRILL)
    expect(row.levelText).toContain(engineWorthZeroText())
    expect(row.levelText).toMatch(/top speed (<0\.01|0\.\d\d)× of 1\.5× cut/)
  })

  it('still sells that worth-zero purchase, with no maxed badge and no max_level refusal', () => {
    const row = engineRowOf(modules, STRONG_DRILL)
    expect(row.badge).toBeNull()
    expect(row.buy.reason).toBeNull()
    const session = dockedSessionOf(modules, STRONG_DRILL)
    const events = session.submit(3, buyUpgradeCommand('engine', CLICK_CHAIN))
    expect(typesOf(events)).toContain('UpgradePurchased')
  })

  it('names the 1.5 times cut parity the purchase waits for in its worth-zero text', () => {
    expect(engineWorthZeroText()).toBe(
      "worth zero: No extra speed until your drill's cut speed is within reach of the engine's top " +
        "speed (needs the engine above 1.5× the drill's cut speed). Raises your top speed once it is.",
    )
  })

  it('leaves every other track buyable', () => {
    const others = rowsOf(modules, STRONG_DRILL).filter((row) => row.upgradeId !== 'engine')
    expect(others.every((row) => row.buy.reason === null && row.badge === null)).toBe(true)
  })
})
