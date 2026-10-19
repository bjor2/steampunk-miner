import { describe, expect, it } from 'vitest'
import { INCOME_RATE_REGISTRY } from '../../systems/registries/incomeRates'
import { entriesOf } from '../../systems/registries/seal'
import { isTripClamped } from '../ores'
import {
  failingVerdictsOf,
  incomeCapVerdictsOf,
  isFailing,
  milestoneIncomeCapVerdictsOf,
  onCurveIncomeCapVerdictsOf,
  type IncomeCapVerdict,
} from './systems/incomeCapCheck'
import { markLadderOfItem } from './systems/itemMarks'
import { lastMarkOf } from './systems/markLadder'
import { reachedMilestonesOf } from './systems/markMilestones'
import { TREE_ECONOMY } from './systems/treeEconomy'

// The golden of the #385 income cap (HS condition 1 on ruling 6167240683): the loaded slices'
// rates, every item owned, on the on-curve vehicle of each judged planet, band 5, in whole basis
// points of a full hold after and before the trip cap. Since ticket 449 the hold is priced at the
// band's rarity-weighted mean (mu_5 = 1.05625), so the trip cap's 15% of the nominal hold reads
// 1421 bp, with the nominal share (1500) beside it. A rate, the trip cap or the drill curve that
// moves a share moves this table, on purpose: say why in the commit. Ticket 553's on-curve hold
// (255 units from P7, past the largest band's ore) moved the drain's unclamped column on P20-P60. Beside it, the same shares
// with each item's sibling-link added (`balance:tree --milestones`, GD lock on #256, ticket 278).

// Drill-throughput gear (`gear.*`, a cut-shape item such as Wide's gallery reamers) is drill speed,
// which the cap never limits (GD ruling on #385, HS condition 4), so it registers no income rate.
const DRILL_THROUGHPUT_PREFIX = 'gear.'

function judgedVerdictsOf(verdictsOf = incomeCapVerdictsOf) {
  return onCurveIncomeCapVerdictsOf(TREE_ECONOMY.incomeCap, verdictsOf)
}

function band5VerdictsOf(verdictsOf = incomeCapVerdictsOf) {
  return judgedVerdictsOf(verdictsOf).filter((v) => v.band === 5 && v.visit === 'arrival')
}

/** Planet, item, then the trip share after the clamp, over the nominal hold, and before the clamp. */
function rowTextOf(v: IncomeCapVerdict): string {
  return `P${v.planetIndex} ${v.itemId} ${v.medianShareBp} ${v.medianNominalShareBp} ${v.medianUnclampedBp}`
}

/** Whether the item's ladder reaches a sibling-link by its last Mark. */
function reachesSiblingLink(itemId: string): boolean {
  const ladder = markLadderOfItem(itemId)
  if (ladder === null) return false
  return reachedMilestonesOf(ladder, lastMarkOf(ladder)).some(
    (milestone) => milestone.pattern === 'sibling-link',
  )
}

describe('income cap golden', () => {
  it('pins every item share on the on-curve vehicle of P10, P20, P40 and P60, band 5', () => {
    expect(band5VerdictsOf().map(rowTextOf)).toEqual([
      'P10 power.mineral_drain 1208 1275 1208',
      'P10 consumable.lodestone_beacon 1421 1500 9089',
      'P10 power.ore_shifter 1421 1500 3906',
      'P10 power.pressure_pocket 1421 1500 5681',
      'P20 power.mineral_drain 1421 1500 1610',
      'P20 consumable.lodestone_beacon 1421 1500 12119',
      'P20 power.ore_shifter 1421 1500 5208',
      'P20 power.pressure_pocket 1421 1500 7574',
      'P40 power.mineral_drain 1421 1500 2716',
      'P40 consumable.lodestone_beacon 1421 1500 20450',
      'P40 power.ore_shifter 1421 1500 8787',
      'P40 power.pressure_pocket 1421 1500 12782',
      'P60 power.mineral_drain 1421 1500 4628',
      'P60 consumable.lodestone_beacon 1421 1500 34841',
      'P60 power.ore_shifter 1421 1500 14971',
      'P60 power.pressure_pocket 1421 1500 21776',
    ])
  })

  it('keeps the drain and movers pricing at the +2 lead off every verdict (RICHEST_LEAD, ticket 449)', () => {
    // The drain and the movers price a cell at its band's ore +2 (RICHEST_LEAD, TD ruling on #445
    // 6221725921 section 1), the richest lead the rarity clamp never holds: the mixed rows' epic
    // (+3) and mythic (+4) are held by it at pickup (#509). The lead moves only the column before
    // the clamp: every item is held to the trip cap by its ledger in play, and its trip after the
    // clamp is at most the cap's 15% of the nominal hold, so a richer price cannot move a verdict.
    expect([0, 1, 2, 3, 4].map((lead) => isTripClamped(lead))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ])
    const verdicts = judgedVerdictsOf()
    expect(verdicts.filter((v) => !v.isTripCappedInPlay).map(rowTextOf)).toEqual([])
    expect(
      verdicts
        .filter((v) => v.medianNominalShareBp > TREE_ECONOMY.incomeCap.maxShareBp)
        .map(rowTextOf),
    ).toEqual([])
  })

  it('registers no drill-throughput gear as an income rate', () => {
    const gearItemIds = entriesOf(INCOME_RATE_REGISTRY)
      .map((rate) => rate.itemId)
      .filter((itemId) => itemId.startsWith(DRILL_THROUGHPUT_PREFIX))
    expect(gearItemIds).toEqual([])
  })

  it('fails no gate on the on-curve vehicle: the drain and the movers are held by the ledger', () => {
    expect(failingVerdictsOf(band5VerdictsOf())).toEqual([])
  })

  it('gates every item strictly on P10, P20, P40 and P60, every band, with no item known-red', () => {
    // The movers left `knownRed` when their ledger landed (ticket 408): nothing is exempt.
    const verdicts = judgedVerdictsOf()
    expect(TREE_ECONOMY.incomeCap.knownRed).toEqual({})
    expect(new Set(verdicts.map((v) => v.band))).toEqual(new Set([1, 2, 3, 4, 5]))
    expect(verdicts.filter(isFailing).map(rowTextOf)).toEqual([])
  })

  it('pins every item share at Mark 9 with its sibling-link, the shifter alone carrying a yield link', () => {
    // The shifter's linked beacon gathers half a beacon's ore: half the beacon's share on top.
    expect(band5VerdictsOf(milestoneIncomeCapVerdictsOf).map(rowTextOf)).toEqual([
      'P10 power.mineral_drain 1208 1275 1208',
      'P10 consumable.lodestone_beacon 1421 1500 9089',
      'P10 power.ore_shifter 1421 1500 8450',
      'P10 power.pressure_pocket 1421 1500 5681',
      'P20 power.mineral_drain 1421 1500 1610',
      'P20 consumable.lodestone_beacon 1421 1500 12119',
      'P20 power.ore_shifter 1421 1500 11267',
      'P20 power.pressure_pocket 1421 1500 7574',
      'P40 power.mineral_drain 1421 1500 2716',
      'P40 consumable.lodestone_beacon 1421 1500 20450',
      'P40 power.ore_shifter 1421 1500 19012',
      'P40 power.pressure_pocket 1421 1500 12782',
      'P60 power.mineral_drain 1421 1500 4628',
      'P60 consumable.lodestone_beacon 1421 1500 34841',
      'P60 power.ore_shifter 1421 1500 32391',
      'P60 power.pressure_pocket 1421 1500 21776',
    ])
  })

  it('has every income item whose last Mark reaches a sibling-link say what the link yields, and no other', () => {
    const rates = entriesOf(INCOME_RATE_REGISTRY)
    const mismatched = rates.filter(
      (rate) =>
        reachesSiblingLink(rate.itemId) !== (rate.linkValuePerMinuteAtFullStack !== undefined),
    )
    expect(mismatched.map((rate) => rate.itemId)).toEqual([])
  })

  it('fails no gate at Mark 9 with the sibling-links: the drain and the movers are held by the ledger', () => {
    expect(failingVerdictsOf(band5VerdictsOf(milestoneIncomeCapVerdictsOf))).toEqual([])
  })
})
