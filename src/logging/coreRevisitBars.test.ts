import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../systems/money'
import {
  gatedCoreRevisitProblemsOf,
  printedCoreRevisitLinesOf,
  type CoreRevisitRun,
} from './coreRevisitBars'

const SEED = 83921

function revisitsOf(revisit: string | null, frontier: string | null): CoreRevisitRun[] {
  return [SEED, SEED + 1, SEED + 2].map((worldSeed) => ({
    worldSeed,
    planet: 2,
    revisitRate: revisit === null ? null : fromCanonical(revisit),
    frontierRate: frontier === null ? null : fromCanonical(frontier),
  }))
}

describe('completed-core revisit bar (ticket 801)', () => {
  it('passes a revisit that earns less a minute than the frontier', () => {
    expect(gatedCoreRevisitProblemsOf(revisitsOf('40', '100'))).toEqual([])
  })

  it('flags a revisit that earns as much a minute as the frontier', () => {
    expect(gatedCoreRevisitProblemsOf(revisitsOf('100', '100'))).toEqual([
      "re-mining planet 2's completed core earns 100.0 a minute, not under the frontier's 100.0 on planet 3",
    ])
  })

  it('judges the median seed, so one seed over the frontier does not flip the bar', () => {
    const revisits = revisitsOf('40', '100')
    revisits[0] = { ...revisits[0], revisitRate: fromCanonical('500') }
    expect(gatedCoreRevisitProblemsOf(revisits)).toEqual([])
  })

  it('flags a planet whose rates were never measured', () => {
    expect(gatedCoreRevisitProblemsOf(revisitsOf(null, '100'))).toEqual([
      "planet 2's completed-core revisit was not measured against its frontier",
    ])
  })

  it('prints each planet’s median revisit and frontier rates', () => {
    expect(printedCoreRevisitLinesOf(revisitsOf('40', null))).toEqual([
      "re-mining planet 2's completed core: 40.0 a minute, frontier planet 3: never",
    ])
  })
})
