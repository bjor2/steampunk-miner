import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { oreTier, oreValue } from '../../../systems/economy/oreEconomy'
import { add, cmp, fromSafeInteger, mul, ZERO_MONEY, type Money } from '../../../systems/money'
import { lastMarkOf, markStepOf } from '../../tech-tree'
import { takeDrainCells } from './drainTake'
import { EXTRACTION_ECONOMY } from './extractionEconomy'
import { extractionItemOf, markLadderOf, type ExtractionItem } from './extractionItems'
import { roomUnderCapOf, tripCapAt } from './tripCap'

// The GD ruling on #201 Q3: until a buy path lets the pacing bot own the drain, acceptance 4 is
// judged here. Whatever Mark the drain is researched to, the ore it moves in any minute stays at or
// under 15% of a full hold of the band's ore, on every planet from 1 to 40 and every band.

const MINUTE_TICKS = 60 * TICKS_PER_SECOND
const LAST_SCHEDULED_PLANET = 40
const BAND_COUNT = 5
/** The richest cells a band holds: its ore with the +2 lead (#140). */
const RICHEST_LEAD = 2
const HOLDS = [12, 24, 96]
const DRAIN = extractionItemOf('power.mineral_drain') as ExtractionItem

interface DrainAtMark {
  mark: number
  cellsPerUse: number
  usesPerMinute: number
}

describe('mineral drain per minute', () => {
  it('moves at most 15% of a full hold of the band ore in a minute at every Mark, P1 to P40', () => {
    const overruns: string[] = []
    for (const drain of drainAtEveryMark()) {
      for (let planet = 1; planet <= LAST_SCHEDULED_PLANET; planet++) {
        for (let band = 1; band <= BAND_COUNT; band++) {
          for (const hold of HOLDS) {
            const moved = drainForAMinute(drain, planet, band, hold)
            if (cmp(moved, fifteenPercentOf(planet, band, hold)) > 0) {
              overruns.push(`Mark ${drain.mark} P${planet} band ${band} hold ${hold}`)
            }
          }
        }
      }
    }
    expect(overruns).toEqual([])
  })

  it('takes more cells per use and more uses a minute at its last Mark than as bought', () => {
    const marks = drainAtEveryMark()
    const [bought, last] = [marks[0], marks[marks.length - 1]]
    expect(last.cellsPerUse).toBeGreaterThan(bought.cellsPerUse)
    expect(last.usesPerMinute).toBeGreaterThan(bought.usesPerMinute)
  })
})

/** The drain's cells per use and its most uses in a minute, Mark 1 to Mastered. */
function drainAtEveryMark(): DrainAtMark[] {
  const ladder = markLadderOf(DRAIN)
  return Array.from({ length: lastMarkOf(ladder) }, (_, index) => {
    const { stats } = markStepOf(ladder, index + 1)
    const charges = stats.charges as number
    const cooldown = stats.cooldown as number
    return {
      mark: index + 1,
      cellsPerUse: stats.magnitude as number,
      usesPerMinute: Math.min(charges, 1 + Math.floor(MINUTE_TICKS / cooldown)),
    }
  })
}

/** A minute of uses, each finding the band's richest ore in reach and the trip carried on. */
function drainForAMinute(drain: DrainAtMark, planet: number, band: number, hold: number): Money {
  const cap = tripCapAt(planet, band, hold)
  const cells = Array.from({ length: drain.cellsPerUse }, (_, tx) => ({
    tile: { tx, ty: 0 },
    ore: richestOreOf(planet, band),
  }))
  let moved = ZERO_MONEY
  let carry = ZERO_MONEY
  for (let use = 0; use < drain.usesPerMinute; use++) {
    const take = takeDrainCells(cells, {
      maxCells: drain.cellsPerUse,
      room: roomUnderCapOf(moved, cap),
      holdRoom: hold,
      yieldShare: EXTRACTION_ECONOMY.income.yieldShare,
      yieldCarry: carry,
    })
    moved = add(moved, take.value)
    carry = take.yieldCarry
  }
  return moved
}

function richestOreOf(planet: number, band: number) {
  const tier = oreTier(planet, band) + RICHEST_LEAD
  return {
    resourceTier: tier,
    saleTier: tier,
    oreId: `kernel.metal.t${tier}`,
    depthTiles: 3,
    chunk: '0,0',
  }
}

/** 15% of a full hold of the band's ore, unrounded (#162 4.5). */
function fifteenPercentOf(planet: number, band: number, hold: number): Money {
  const fullHold = mul(fromSafeInteger(hold), oreValue(oreTier(planet, band)))
  return mul(EXTRACTION_ECONOMY.income.tripCapShare, fullHold)
}
