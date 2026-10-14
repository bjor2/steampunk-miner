import { describe, expect, it } from 'vitest'
import { onCurveSteps } from '../../systems/economy/vehicleStats'
import { INCOME_RATE_REGISTRY, type IncomeAnchors } from '../../systems/registries/incomeRates'
import { entriesOf } from '../../systems/registries/seal'
import { failingVerdictsOf, incomeCapVerdictsOf, type SeedIncome } from './systems/incomeCapCheck'
import { TREE_ECONOMY } from './systems/treeEconomy'

// The golden of the #385 income cap (HS condition 1 on ruling 6167240683): the loaded slices'
// rates, every item owned, on the on-curve vehicle of each judged planet, band 5, in whole basis
// points of a full hold after and before the trip cap. A rate, the trip cap or the drill curve that
// moves a share moves this table, on purpose: say why in the commit.

// Drill-throughput gear (`gear.*`, a cut-shape item such as Wide's gallery reamers) is drill speed,
// which the cap never limits (GD ruling on #385, HS condition 4), so it registers no income rate.
const DRILL_THROUGHPUT_PREFIX = 'gear.'

const EVERY_ITEM_OWNED: IncomeAnchors = { isRowLive: () => true, isItemOwned: () => true }

function onCurveSeedOf(planetIndex: number): SeedIncome {
  const levels = onCurveSteps(planetIndex)
  const visits = { arrival: levels, departure: levels }
  return { levelsOn: new Map([[planetIndex, visits]]), anchors: EVERY_ITEM_OWNED }
}

function band5VerdictsOf() {
  const seeds = TREE_ECONOMY.incomeCap.planets.map(onCurveSeedOf)
  return incomeCapVerdictsOf(seeds).filter((v) => v.band === 5 && v.visit === 'arrival')
}

describe('income cap golden', () => {
  it('pins every item share on the on-curve vehicle of P10, P20, P40 and P60, band 5', () => {
    const rows = band5VerdictsOf().map(
      (v) => `P${v.planetIndex} ${v.itemId} ${v.medianShareBp} ${v.medianUnclampedBp}`,
    )
    expect(rows).toEqual([
      'P10 power.mineral_drain 1500 2550',
      'P10 consumable.lodestone_beacon 1500 19200',
      'P10 power.ore_shifter 1500 8250',
      'P10 power.pressure_pocket 1500 12000',
      'P20 power.mineral_drain 1500 3125',
      'P20 consumable.lodestone_beacon 1500 20000',
      'P20 power.ore_shifter 1500 8594',
      'P20 power.pressure_pocket 1500 12500',
      'P40 power.mineral_drain 1500 3000',
      'P40 consumable.lodestone_beacon 1500 19200',
      'P40 power.ore_shifter 1500 8250',
      'P40 power.pressure_pocket 1500 12000',
      'P60 power.mineral_drain 1500 3000',
      'P60 consumable.lodestone_beacon 1500 19200',
      'P60 power.ore_shifter 1500 8250',
      'P60 power.pressure_pocket 1500 12000',
    ])
  })

  it('registers no drill-throughput gear as an income rate', () => {
    const gearItemIds = entriesOf(INCOME_RATE_REGISTRY)
      .map((rate) => rate.itemId)
      .filter((itemId) => itemId.startsWith(DRILL_THROUGHPUT_PREFIX))
    expect(gearItemIds).toEqual([])
  })

  it('fails no gate on the on-curve vehicle: the drain is held by the ledger, the movers are known-red', () => {
    expect(failingVerdictsOf(band5VerdictsOf())).toEqual([])
  })
})
