import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { contentOf } from '../../../systems/registries/content'
import { nodeCostOf } from '../../tech-tree'
import {
  ACT_TICK,
  DRAIN_ID,
  drainSessionAt,
  ofType,
  press,
  PRESS_TICK,
  standingTileWithOre,
} from '../drainTestSession'
import { bestGradeCellsOf, forkCellsPerUseOf, forkReachBonusOf } from './drainFork'
import type { DrainableCell } from './drainReach'
import {
  branchBonusAt,
  EXTRACTION_FORK,
  EXTRACTION_FORK_BALANCE,
  HAULER_HOPPER,
  isProspecting,
  PROSPECTOR_SIEVE,
} from './extractionFork'

// The extraction lane's P16 fork (GD lock on #255, ticket 269): Hauler takes volume through the
// drain, Prospector takes only the best grade. Hauler moves income, so it stays unregistered until
// the 15% income-cap check (#385) merges (GD ruling on #212, 14 Oct).

const HAULER = 'tech.extraction.fork.hauler'
const PROSPECTOR = 'tech.extraction.fork.prospector'
const ORIGIN = standingTileWithOre(5)

function chooseFork(branch: string): CommandIntent {
  return { type: 'tech-tree.choose_fork', payload: { lane: 'extraction', branch } } as CommandIntent
}

/** The drain session at `ORIGIN`, moved to P16 and choosing `branch` there. */
function drainSessionAfterChoosing(branch: string) {
  const session = drainSessionAt(ORIGIN)
  session.submit(2, { type: 'debug.setPlanet', payload: { planetIndex: 16 } })
  session.submit(2, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  const chosen = session.submit(2, chooseFork(branch))
  return { session, chosen }
}

function cellOfTier(tx: number, saleTier: number): DrainableCell {
  return { tile: { tx, ty: 0 }, ore: { saleTier } as DrainableCell['ore'] }
}

describe('extraction fork', () => {
  it('registers the Prospector as the lane’s P16 branch and holds the Hauler unregistered', () => {
    const ids = contentOf('tech-node')
      .filter((node) => node.id.startsWith('tech.extraction.fork.'))
      .map((node) => node.id)
    expect(ids).toEqual([PROSPECTOR])
    expect(nodeCostOf(HAULER, 16)).toBeNull()
    expect(nodeCostOf(PROSPECTOR, 16)).not.toBeNull()
  })

  it('refuses the Hauler as an unknown branch while it is held', () => {
    const { chosen } = drainSessionAfterChoosing('hauler')
    expect(chosen).toContainEqual(expect.objectContaining({ reason: 'unknown_branch' }))
  })

  it('builds both branches on one tier with no prerequisite, so they cost the same', () => {
    const [hauler, prospector] = EXTRACTION_FORK.branches
    expect([hauler.id, prospector.id]).toEqual([HAULER, PROSPECTOR])
    expect([hauler.unlockTier, prospector.unlockTier]).toEqual([16, 16])
    expect([hauler.prereqs, prospector.prereqs]).toEqual([[], []])
    expect([hauler.unlocks, prospector.unlocks]).toEqual([HAULER_HOPPER, PROSPECTOR_SIEVE])
  })

  it('names no magnet, vision row or digit on either branch', () => {
    const text = JSON.stringify(EXTRACTION_FORK.branches.map((node) => node.description))
    expect(text).not.toMatch(/magnet|\d/i)
  })

  it('gives the Hauler its reach and cells at its Mark, and nothing at Mark 0', () => {
    expect(branchBonusAt(HAULER_HOPPER, 0)).toBe(0)
    expect(branchBonusAt(HAULER_HOPPER, 1)).toBe(EXTRACTION_FORK_BALANCE.haulerReachBonusTiles)
    expect(branchBonusAt(PROSPECTOR_SIEVE, 1)).toBe(
      EXTRACTION_FORK_BALANCE.prospectorReachBonusTiles,
    )
  })

  it('lets the Prospector reach further and choose, without the Hauler’s volume', () => {
    const { session } = drainSessionAfterChoosing('prospector')
    const state = session.state()
    expect(isProspecting(state, 'p1')).toBe(true)
    expect(forkReachBonusOf(state, 'p1')).toBe(EXTRACTION_FORK_BALANCE.prospectorReachBonusTiles)
    expect(forkCellsPerUseOf(state, 'p1', 6)).toBe(6)
  })

  it('plays the drain as before for a player with no branch', () => {
    const session = drainSessionAt(ORIGIN)
    expect([isProspecting(session.state(), 'p1'), forkReachBonusOf(session.state(), 'p1')]).toEqual(
      [false, 0],
    )
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK + 4)
    const [yielded] = ofType(session.events(), 'extraction.DrainYielded')
    expect(yielded).toMatchObject({ itemId: DRAIN_ID })
  })

  it('takes only the best grade in reach, in the drain’s order', () => {
    const cells = [cellOfTier(1, 2), cellOfTier(2, 3), cellOfTier(3, 1), cellOfTier(4, 3)]
    expect(bestGradeCellsOf(cells).map((cell) => cell.tile.tx)).toEqual([2, 4])
    expect(bestGradeCellsOf([])).toEqual([])
  })
})
