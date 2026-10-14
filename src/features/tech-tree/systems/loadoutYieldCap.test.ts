import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { cmp, fromSafeInteger, ZERO_MONEY } from '../../../systems/money'
import { ITEM_HOOK_REGISTRY, type ItemHook } from '../../../systems/registries/itemHooks'
import { entriesOf } from '../../../systems/registries/seal'
import { withFixtureTree } from '../treeTestSession'
import {
  aethericYieldClaimsOf,
  LOADOUT_YIELD_PLANETS,
  loadoutYieldOf,
  loadoutYieldsOf,
  onCurveIncomeAtOf,
  overCapLoadoutsOf,
} from './loadoutYieldCap'
import type { TechNode } from './techNode'
import { registeredCatalogue, type TreeCatalogue } from './techTree'

// The loadout yield cap (GD lock on #245, the Vertical Scaler's stacking condition; ticket 266),
// on the registered content: every income item owned at its last Mark, against the same items
// outside the Aetheric lane, at the on-curve vehicle of P10, P20, P40 and P60.

const WHISTLE = 'power.resonance_whistle'

/** A slice that gives the whistle a rate: the yield the lock forbids the lane. */
const WHISTLE_RATE: SliceDefinition = {
  id: 'yield-probe',
  register: (r) =>
    r.incomeRate({
      id: 'yield-probe.whistle',
      itemId: WHISTLE,
      anchorRowId: 'research_lab',
      isTripCappedInPlay: false,
      valuePerMinuteAtFullStack: () => fromSafeInteger(500),
    }),
}

function aethericNodesOf(catalogue: TreeCatalogue): TechNode[] {
  return catalogue.nodes.filter((node) => node.lane === 'aetheric')
}

function catalogueWithIncomeWhistle(): TreeCatalogue {
  const catalogue = registeredCatalogue()
  const nodes = catalogue.nodes.map((node) =>
    node.unlocks === WHISTLE ? { ...node, marks: { isIncomeItem: true, cooldown: 900 } } : node,
  )
  return { ...catalogue, nodes }
}

const DRAIN_HOOK_ON_WHISTLE: ItemHook = {
  id: 'yield-probe.whistle_drain',
  hook: 'reach',
  laneId: 'extraction',
  parentItemId: WHISTLE,
  incomeItemId: 'power.mineral_drain',
  answer: () => null,
}

describe('tech tree: the loadout yield cap', () => {
  it('reads the whole Aetheric lane, its entry, fork branches, governor and condenser', () => {
    const items = aethericNodesOf(registeredCatalogue()).map((node) => node.unlocks)
    expect(items).toEqual(
      expect.arrayContaining([
        WHISTLE,
        'power.phase_lantern',
        'power.arc_coil',
        'power.chronometric_governor',
        'power.aether_condenser',
      ]),
    )
  })

  it("sums a full loadout at max Mark to no more than today's five-lane maximum on P10, P20, P40 and P60", () => {
    const yields = loadoutYieldsOf(registeredCatalogue())
    expect(yields.map((loadout) => loadout.planetIndex)).toEqual([...LOADOUT_YIELD_PLANETS])
    expect(overCapLoadoutsOf(yields)).toEqual([])
    yields.forEach((loadout) => expect(cmp(loadout.fiveLaneYield, ZERO_MONEY)).toBe(1))
  })

  it('counts the aetheric contribution as zero on every judged planet', () => {
    const yields = loadoutYieldsOf(registeredCatalogue())
    expect(yields.map((loadout) => cmp(loadout.aethericYield, ZERO_MONEY))).toEqual([0, 0, 0, 0])
  })

  it('finds no aetheric item with an income ladder or an income hook', () => {
    expect(aethericYieldClaimsOf(registeredCatalogue(), entriesOf(ITEM_HOOK_REGISTRY))).toEqual([])
  })

  it('breaks the cap once an aetheric item registers a rate', () => {
    const loadout = withFixtureTree(
      () => loadoutYieldOf(onCurveIncomeAtOf(10), registeredCatalogue()),
      [WHISTLE_RATE],
    )
    expect(cmp(loadout.aethericYield, ZERO_MONEY)).toBe(1)
    expect(loadout.isWithinCap).toBe(false)
  })

  it('names an aetheric income ladder and a hook adding yield on an aetheric item as claims', () => {
    expect(aethericYieldClaimsOf(catalogueWithIncomeWhistle(), [DRAIN_HOOK_ON_WHISTLE])).toEqual([
      `${WHISTLE} has an income item's Mark ladder`,
      'yield-probe.whistle_drain adds yield toward power.mineral_drain',
    ])
  })

  it('reads the on-curve drill cutting band 5 of every judged planet', () => {
    LOADOUT_YIELD_PLANETS.forEach((planetIndex) => {
      const at = onCurveIncomeAtOf(planetIndex)
      expect(at.band).toBe(5)
      expect(cmp(at.drillOrePerMinute, ZERO_MONEY)).toBe(1)
    })
  })
})
