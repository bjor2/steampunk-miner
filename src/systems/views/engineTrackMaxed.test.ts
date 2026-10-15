import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { ECONOMY } from '../economy/economy'
import { createScriptedSession, dockInBay, typesOf } from '../authority/scriptedSession'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { workshopRowsOf } from './workshopRows'

// The engine track stays finite (GD lock on #316 scope 0, ticket 333): the card reads "maxed,
// drill sets travel" exactly when k times the drill's cut speed reaches the engine's top speed,
// and then offers no buy. Under ticket 396's 4-tick stopgap floor a floor-bound drill already
// passes every engine; a one-tick floor, as the #304 law with no floor allows, is swapped into
// `economy.json` on a fresh module graph with no slices registered (a kernel spec never imports
// one), as `physics/sweptCutPace.test.ts` does.

/** Steps that cut band-1 rock at the tile floor. */
const STRONG_DRILL = { drill_power: 2000, drill_tip: 600 }

/** Steps whose k times cut passes the 6 m/s engine in planet 1's band 1 (6.9) but not band 5 (1.68). */
const BAND_ONE_DRILL = { drill_power: 100, drill_tip: 30 }

interface RowModules {
  createScriptedSession: typeof createScriptedSession
  dockInBay: typeof dockInBay
  workshopRowsOf: typeof workshopRowsOf
}

/** A rig with `levels`, docked at the Upgrade bay with money to spare: a level-200 drill step
 * costs about 1e35 on ticket 396's rows. */
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

async function modulesWithFloor(minTicksPerTile: number) {
  vi.resetModules()
  vi.doMock('../economy/economy', () => ({
    ECONOMY: { ...ECONOMY, drill: { ...ECONOMY.drill, minTicksPerTile } },
  }))
  ;(await import('../../registries/registrar')).loadSlices([])
  const { createScriptedSession, dockInBay } = await import('../authority/scriptedSession')
  const rows = await import('./workshopRows')
  return { createScriptedSession, dockInBay, workshopRowsOf: rows.workshopRowsOf, rows }
}

describe('engine track at the 4-tick floor (ticket 396)', () => {
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

  it('reads maxed once a floor-bound drill sets travel, k times 15 m/s', () => {
    const row = engineRowOf(modules, STRONG_DRILL)
    expect(row.badge).toBe('maxed')
    expect(row.buy.reason).toBe('max_level')
  })
})

describe('engine track past the crossover (ticket 333, a one-tick floor)', () => {
  afterEach(() => {
    vi.doUnmock('../economy/economy')
    vi.resetModules()
  })

  it('reads maxed, drill sets travel, and offers no buy once the drill sets travel', async () => {
    const modules = await modulesWithFloor(1)
    const row = engineRowOf(modules, STRONG_DRILL)
    expect(row.badge).toBe('maxed')
    expect(row.levelText).toContain(modules.rows.ENGINE_MAXED_TEXT)
    expect(row.buy.reason).toBe('max_level')
  })

  it('offers the buy while the drill is still slower than the engine', async () => {
    const modules = await modulesWithFloor(1)
    const row = engineRowOf(modules, { engine: 400 })
    expect(row.badge).toBeNull()
    expect(row.buy.reason).toBeNull()
  })

  it('leaves every other track buyable', async () => {
    const modules = await modulesWithFloor(1)
    const others = rowsOf(modules, STRONG_DRILL).filter((row) => row.upgradeId !== 'engine')
    expect(others.every((row) => row.buy.reason === null && row.badge === null)).toBe(true)
  })
})
