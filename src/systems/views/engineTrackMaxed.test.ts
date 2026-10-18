import { describe, expect, it } from 'vitest'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { createScriptedSession, dockInBay, typesOf } from '../authority/scriptedSession'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { ENGINE_MAXED_TEXT, workshopRowsOf } from './workshopRows'

// The engine track stays finite (GD lock on #316 scope 0, ticket 333): the card reads "maxed,
// drill sets travel" exactly when k times the drill's cut speed reaches the engine's top speed,
// and then offers no buy. With no tile floor (ticket 397) a strong drill passes every engine.

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

describe('engine track with no tile floor (tickets 333, 396, 397)', () => {
  const modules = { createScriptedSession, dockInBay, workshopRowsOf }

  it('offers its buy with a starting drill, whose k times cut stays under the top speed', () => {
    const row = engineRowOf(modules, {})
    expect(row.badge).toBeNull()
    expect(row.buy.reason).toBeNull()
    expect(row.levelText).not.toContain('drill sets travel')
  })

  // #418 (GD option a): an engine step still speeds travel in the deeper bands, so it is offered.
  it('offers its buy at the dock while the drill sets travel in band 1 but not the hardest band', () => {
    const row = engineRowOf(modules, BAND_ONE_DRILL)
    expect(row.badge).toBeNull()
    expect(row.buy.reason).toBeNull()
  })

  it('sells that engine step at the dock rather than refusing it max_level', () => {
    const session = dockedSessionOf(modules, BAND_ONE_DRILL)
    const events = session.submit(3, buyUpgradeCommand('engine', CLICK_CHAIN))
    expect(typesOf(events)).toContain('UpgradePurchased')
  })

  it('reads maxed, drill sets travel, and offers no buy once the drill sets travel', () => {
    const row = engineRowOf(modules, STRONG_DRILL)
    expect(row.badge).toBe('maxed')
    expect(row.levelText).toContain(ENGINE_MAXED_TEXT)
    expect(row.buy.reason).toBe('max_level')
  })

  it('offers the buy while the drill is still slower than the engine', () => {
    const row = engineRowOf(modules, { engine: 400 })
    expect(row.badge).toBeNull()
    expect(row.buy.reason).toBeNull()
  })

  it('leaves every other track buyable', () => {
    const others = rowsOf(modules, STRONG_DRILL).filter((row) => row.upgradeId !== 'engine')
    expect(others.every((row) => row.buy.reason === null && row.badge === null)).toBe(true)
  })
})
