import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { MM_PER_METRE } from '../../constants/physics'
import { drillStampRadiusMm } from '../vehicle/drillBore'
import { casingRingAround, ringSamplesOf } from '../world/casingLining'
import { tileOfSample } from '../world/groundEditSession'
import type { WeightedSample } from '../world/stampShape'
import { casableRingSamplesOf } from './casingGates'
import { createScriptedSession, PARAMS, surfaceOreTiles } from './scriptedSession'

// Gated cells are never cased (GD lock on #661): a fake slice registers a gate on every ore cell
// through withRegistrations, so no real slice is imported.

const [ORE_TILE] = surfaceOreTiles(1)
/** A ring whose annulus crosses the ore tile: its axis a bore's radius and a half sample left of it. */
const RING = casingRingAround(
  ORE_TILE.tx * MM_PER_METRE - drillStampRadiusMm() - 125,
  ORE_TILE.ty * MM_PER_METRE + MM_PER_METRE / 2,
)

function gateSliceOf(outcome: GateOutcome): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.every-ore',
        check: () => ({ outcome, gateKind: 'probe', required: 'probe-rig', have: 'none' }),
      }),
  }
}

function casableWith(slices: readonly SliceDefinition[]): WeightedSample[] {
  return withRegistrations(slices, () => {
    const state = createScriptedSession().state()
    return casableRingSamplesOf(state, 'p1', PARAMS, RING)
  })
}

function isOnOreTile(sample: WeightedSample): boolean {
  const tile = tileOfSample(sample)
  return tile.tx === ORE_TILE.tx && tile.ty === ORE_TILE.ty
}

describe('casing gates', () => {
  it('lines the whole ring with no gate registered', () => {
    const samples = casableWith([])
    expect(samples).toEqual(ringSamplesOf(RING))
    expect(samples.some(isOnOreTile)).toBe(true)
  })

  it('never lines a cell a gate keeps standing against the drill', () => {
    for (const outcome of ['refused', 'blocked'] as const) {
      const samples = casableWith([gateSliceOf(outcome)])
      expect(samples.some(isOnOreTile)).toBe(false)
      expect(samples.length).toBeGreaterThan(0)
    }
  })

  it('lines a cell the gate lets the drill cut', () => {
    expect(casableWith([gateSliceOf('cut')])).toEqual(ringSamplesOf(RING))
  })
})
