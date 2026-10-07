import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { blastRadiusMm, chargeSize } from '../../economy/blastingCharges'
import { oreSalePrice } from '../../economy/oreEconomy'
import { fromSafeInteger, mul, toCanonical, ZERO_MONEY } from '../../money'
import type { GateQuery, GateVerdict } from '../../registries/gateChecks'
import { cellDensitySum } from '../../world/cellYield'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../../world/sampleGrid'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { createScriptedSession, FREEZE_ENEMIES, PARAMS } from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import { blastTilesAround } from './blastOre'
import { fiveOreBlastSite, ofType, PLANT, poseOnTile, setChargesIntent } from './chargeFixtures'

// A charge's blast asks the slices' gate checks about its ore cells (feature-slices.md 3.6, K2);
// a fake slice registers one through withRegistrations, so no real slice is imported. The site's
// blast holds five ore cells of one tier in band-2 rock of planet 1.

const FUSE_TICKS = 120
const BLAST_TICK = 1 + FUSE_TICKS
/** The 2.5-tile blast clears on its tick; its rim checks are done a few ticks later (K6). */
const RESOLVED_TICK = BLAST_TICK + 5
const SITE = fiveOreBlastSite()
const FULL_CELL = SAMPLES_PER_CELL * SOLID_DENSITY

type Gate = (query: GateQuery) => GateVerdict | null

function gateSliceOf(gate: Gate): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) => r.gateCheck({ id: 'gate-probe.blast', check: gate }),
  }
}

/** #142's dynamite gate at `minCharge` 1: the drill skids off the shell, a size-1 charge frees it. */
const dynamiteGate: Gate = ({ blast }) => ({
  outcome: (blast?.size ?? 0) >= 1 ? 'cut' : 'refused',
  gateKind: 'dynamite',
  required: 'charge:1',
  have: `charge:${blast?.size ?? 0}`,
})

const everyOre =
  (outcome: GateVerdict['outcome']): Gate =>
  () => ({ outcome, gateKind: 'probe', required: 'probe-rig', have: 'none' })

/** Plants beside the site's wall, backs off and blows it, with only `slices` registered. */
function blastSiteWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, setChargesIntent(3))
    session.submit(0, poseOnTile({ tx: SITE.wall.tx - 1, ty: SITE.wall.ty }))
    session.submit(1, PLANT)
    session.submit(2, poseOnTile({ tx: SITE.wall.tx - 5, ty: SITE.wall.ty }))
    const events = session.advanceTo(RESOLVED_TICK)
    const [resolved] = ofType(events, 'BlastResolved')
    return {
      events,
      resolved,
      cargo: session.vehicle().cargo.ore,
      oreDensities: oreTilesOfSite().map((tile) =>
        cellDensitySum(session.state().world, PARAMS, tile),
      ),
      digest: stateDigest(session.state()),
    }
  })
}

function oreTilesOfSite(): TilePoint[] {
  return blastTilesAround(SITE.wall).filter(
    (tile) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ore,
  )
}

const valueOfUnits = (units: number) =>
  toCanonical(mul(fromSafeInteger(units), oreSalePrice(SITE.tier)))

describe('charge blast gates', () => {
  it('tells the gate checks the blast and its planter', () => {
    const queries: GateQuery[] = []
    blastSiteWith([gateSliceOf((query) => (queries.push(query), null))])
    // The live blast asks along its front, nearest first (K6), so compare the tiles as a set.
    expect(queries.map(({ tile }) => tile)).toEqual(expect.arrayContaining(oreTilesOfSite()))
    expect(queries).toHaveLength(oreTilesOfSite().length)
    expect(queries.map(({ playerId }) => playerId)).toEqual(Array(5).fill('p1'))
    expect(queries[0].blast).toEqual({
      ...SITE.wall,
      radiusMm: blastRadiusMm(),
      size: chargeSize(),
      playerId: 'p1',
      source: 'charge',
      tick: BLAST_TICK,
    })
  })

  it("keeps today's blast when no gate has a verdict on its cells", () => {
    const plain = blastSiteWith([])
    const quiet = blastSiteWith([gateSliceOf(() => null)])
    expect(quiet.events).toEqual(plain.events)
    expect(quiet.digest).toBe(plain.digest)
  })

  it('frees a dynamite-gated cell whole: every unit reaches the hold and none is lost', () => {
    const blasted = blastSiteWith([gateSliceOf(dynamiteGate)])
    expect(blasted.cargo).toEqual({ [String(SITE.tier)]: 5 })
    expect(ofType(blasted.events, 'CargoAdded')).toHaveLength(5)
    expect(blasted.resolved.oreValueLost).toBe(toCanonical(ZERO_MONEY))
    expect(blasted.oreDensities).toEqual(Array(5).fill(0))
  })

  it('leaves an ore cell a gate refuses standing in the crater, and pays nothing for it', () => {
    const plain = blastSiteWith([])
    const blasted = blastSiteWith([gateSliceOf(everyOre('refused'))])
    expect(blasted.oreDensities).toEqual(Array(5).fill(FULL_CELL))
    expect(blasted.cargo).toEqual({})
    expect(blasted.resolved.tilesCleared).toBe(plain.resolved.tilesCleared - 5)
    expect(blasted.resolved.oreValueLost).toBe(toCanonical(ZERO_MONEY))
  })

  it('breaks an ore cell a gate says is lost and counts all its ore as lost', () => {
    const blasted = blastSiteWith([gateSliceOf(everyOre('lost'))])
    expect(blasted.oreDensities).toEqual(Array(5).fill(0))
    expect(blasted.cargo).toEqual({})
    expect(blasted.resolved.oreValueLost).toBe(valueOfUnits(5))
  })
})
