import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../seededRandom'
import { productModuloOf, removalOverTicks, ticksToRemoveFrom } from './carvePhase'

// Ticket 558: the carve's phase `a T0 mod b` stays exact past 2^53, so a lifted drill quantum
// carves the same ground at tick 10^9 as at tick 0.

/** The removal as `groundEdit.ts` wrote it before ticket 558, for products under 2^53. */
function naiveRemovalOf(perTick: number, per: number, firstTick: number, ticks: number): number {
  return Math.floor((perTick * (firstTick + ticks)) / per) - Math.floor((perTick * firstTick) / per)
}

function naiveTicksToRemoveOf(perTick: number, per: number, firstTick: number, amount: number) {
  const target = amount + Math.floor((perTick * firstTick) / per)
  return Math.ceil((target * per) / perTick) - firstTick
}

describe('the carve phase (ticket 558)', () => {
  it('takes a product modulo exactly, under 2^53 and past it', () => {
    expect(productModuloOf(255 * 256 * 60, 1_000, 256 * 37)).toBe((255 * 256 * 60 * 1_000) % 9_472)
    const big = productModuloOf(255 * 256 * 122_880, 2_000_000_000, 256 * 153)
    expect(big).toBe(Number((BigInt(255 * 256 * 122_880) * 2_000_000_000n) % BigInt(256 * 153)))
  })

  it('removes what the whole-product formula removed wherever that formula was exact', () => {
    const random = createSeededRandom(558)
    for (let trial = 0; trial < 2_000; trial++) {
      const perTick = 255 * (1 + random.nextInt(256)) * 60
      const per = 256 * (1 + random.nextInt(900))
      const firstTick = random.nextInt(1_000_000)
      const ticks = 1 + random.nextInt(40)
      const rate = { perTick, per }
      const removal = removalOverTicks(rate, firstTick, ticks)
      expect(removal).toBe(naiveRemovalOf(perTick, per, firstTick, ticks))
      if (removal > 0) {
        expect(ticksToRemoveFrom(rate, firstTick, removal)).toBe(
          naiveTicksToRemoveOf(perTick, per, firstTick, removal),
        )
      }
    }
  })

  it('clears a full sample in its drill time at a tick past where the product leaves 2^53', () => {
    const quantum = 122_880
    const subSteps = 153
    const rate = { perTick: 255 * 256 * quantum, per: 256 * subSteps }
    const firstTick = 3_000_000_000
    expect(Number.isSafeInteger(rate.perTick * firstTick)).toBe(false)
    let removed = 0
    for (let tick = firstTick; tick < firstTick + subSteps; tick++) {
      removed += removalOverTicks(rate, tick, 1)
    }
    expect(removed).toBe(255 * quantum)
  })
})
