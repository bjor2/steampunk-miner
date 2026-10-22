import { describe, expect, it } from 'vitest'
import {
  createScriptedSession,
  dockInBay,
  type ScriptedSession,
} from '../authority/scriptedSession'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { buyCasingGradeCommand, buyUpgradeCommand } from '../platform/platformCommands'
import { KERNEL_ITEMS } from '../registries/kernelItems'
import { grantMoneyCommand } from '../startScenarioCommands'
import { KEYBOARD_PROMPTS } from '../input/promptFixtures'
import { buyCueOfDials } from './dialBuyCue'
import { gaugeClusterOf, type GaugeClusterView } from './gaugeCluster'
import {
  BUY_CUE_COUNTS,
  CASING_COUNT,
  GAUGE_CLUSTER,
  buyCueProblemsOf,
  type GaugeClusterTable,
} from './gaugeClusterTable'
import { selectHudModel } from './hudModel'
import type { LayoutKind } from './designSystem'
import { isNewCapabilityItem } from './newCapability'
import type { CommandIntent } from '../authority/authorityCommand'

// Ticket 727 (spec #678, G&V's gap list): every upgrade buy steps a small notch on its track's
// #716 dial on the render the level reaches, so even a +1 buy shows. Display only: it reads the
// levels owned, previews nothing unowned, never starts the #718 reveal, and moves no economy number.

const CASING_DIAL = 'depth'

function stockedAtUpgradeBay(money = '1e9'): ScriptedSession {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand(money))
  dockInBay(session, 2, 'upgrade')
  return session
}

function clusterOf(session: ScriptedSession, kind: LayoutKind = 'desktop'): GaugeClusterView {
  const model = selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 0,
    prompts: KEYBOARD_PROMPTS,
  })
  return gaugeClusterOf(model, kind)
}

function cuesOf(cluster: GaugeClusterView): Record<string, number | null> {
  return Object.fromEntries(cluster.dials.map((face) => [face.id, face.cue?.notch ?? null]))
}

function buyCommandOf(count: string): CommandIntent {
  return count === CASING_COUNT
    ? buyCasingGradeCommand(CLICK_CHAIN)
    : buyUpgradeCommand(count, CLICK_CHAIN)
}

function buy(session: ScriptedSession, count: string): void {
  session.submit(session.state().tick, buyCommandOf(count))
}

function dialOfCount(count: string): string {
  return Object.entries(GAUGE_CLUSTER.buyCue.counts).find(([, counts]) =>
    counts.includes(count),
  )![0]
}

describe('dial buy cue (ticket 727)', () => {
  it('gives every track and the casing grade exactly one dial to move', () => {
    expect(buyCueProblemsOf(GAUGE_CLUSTER)).toEqual([])
    expect(dialOfCount('casing')).toBe(CASING_DIAL)
    expect(BUY_CUE_COUNTS).toEqual([...UPGRADE_IDS, CASING_COUNT])
  })

  it('refuses a cue table that leaves a buy unseen, counts one twice or names no dial', () => {
    const broken: GaugeClusterTable = {
      ...GAUGE_CLUSTER,
      buyCue: { notches: 1, counts: { hull: ['hull', 'boiler'], fuel: ['boiler'], gear: ['x'] } },
    }
    expect(buyCueProblemsOf(broken)).toEqual([
      'buyCue.notches is 1, not a whole number from 2',
      'buyCue names no dial "gear"',
      'buyCue counts "x", which no buy raises',
      'buy count "drill_power" must be on exactly one dial',
      'buy count "drill_tip" must be on exactly one dial',
      'buy count "engine" must be on exactly one dial',
      'buy count "boiler" must be on exactly one dial',
      'buy count "cargo_hold" must be on exactly one dial',
      'buy count "casing" must be on exactly one dial',
    ])
  })

  it('moves only the bought track’s dial by one notch on the render that follows any single buy', () => {
    for (const count of BUY_CUE_COUNTS) {
      const session = stockedAtUpgradeBay()
      const before = cuesOf(clusterOf(session))
      buy(session, count)
      const after = cuesOf(clusterOf(session))
      const dialId = dialOfCount(count)
      expect(after[dialId], count).toBe((before[dialId]! + 1) % GAUGE_CLUSTER.buyCue.notches)
      expect({ ...after, [dialId]: null }, count).toEqual({ ...before, [dialId]: null })
    }
  })

  it('carries a folded dial’s cue on the overflow cell of a phone’s surface strip', () => {
    const session = stockedAtUpgradeBay()
    const before = clusterOf(session, 'phone')
    expect(before.dials.map((face) => face.id)).not.toContain('depth')
    buy(session, 'drill_power')
    const after = clusterOf(session, 'phone')
    expect(after.overflowCue?.notch).toBe(before.overflowCue!.notch + 1)
    expect(cuesOf(after)).toEqual(cuesOf(before))
  })

  it('keeps stepping past the last notch, so the hundredth buy still shows', () => {
    const { notches } = GAUGE_CLUSTER.buyCue
    const last = buyCueOfDials(['hull'], { hull: notches - 1 })
    const next = buyCueOfDials(['hull'], { hull: notches })
    expect(last).toEqual({
      notch: notches - 1,
      permille: Math.floor(((notches - 1) * 1000) / notches),
    })
    expect(next).toEqual({ notch: 0, permille: 0 })
  })

  it('previews nothing unowned: a refused buy leaves every cue where it was', () => {
    const session = stockedAtUpgradeBay('0')
    const before = clusterOf(session)
    buy(session, 'hull')
    expect(clusterOf(session)).toEqual(before)
  })

  it('cues only stat steps, which the shared new-capability flag never counts, so no reveal', () => {
    for (const count of UPGRADE_IDS) {
      expect(isNewCapabilityItem({ kind: 'track', id: count }), count).toBe(false)
    }
    expect(isNewCapabilityItem(KERNEL_ITEMS.casing)).toBe(false)
  })

  it('draws no cue on a dial the table lists no buy under', () => {
    expect(buyCueOfDials(['heat'], { hull: 3 })).toBeNull()
  })
})
