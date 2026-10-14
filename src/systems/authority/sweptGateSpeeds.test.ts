import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import type { TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import { vehicleOf } from './authorityState'
import { createScriptedSession, PARAMS, poseAbove, surfaceOreTiles } from './scriptedSession'
import type { RuleEffect } from './commandRule'
import { drillAlongSweep, type SweptStep } from './sweptDrill'
import { drillAlongSpan } from './sweptSpanDrill'

// The Horizontal Scaler's pin (TD scope a on #316, ticket 334): the swept cut checks the gates
// on every cell it crosses at any speed, so a fast tick never cuts past a gated cell. The
// sweeps run at 18, 100 and 1,000 m/s, past what any stats bound allows today, so the spec drives
// the sweep (`drillAlongSweep`) directly, one tick at a time, rather than through `drillStep`. The
// swept span (ticket 374) checks every crossed cell the same way, so it runs the same sweeps.

const SPEEDS_M_PER_S = [18, 100, 1000]

type SweepCut = (
  state: AuthorityState,
  params: typeof PARAMS,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
) => RuleEffect

const CUTS: readonly [string, SweepCut][] = [
  ['the per-cell walk', drillAlongSweep],
  ['the swept span', (...cut) => drillAlongSpan(...cut).effect],
]

/** A slice whose gate check answers `outcome` for every ore cell, as a rig or a charge gate does. */
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

/** A slice that makes every ore cell dense: a level-0 tip skids on it (tip-locked, #236). */
const DENSE_ORE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) => r.oreDrillClass({ id: 'gate-probe.dense', drillClassOf: () => 'dense' }),
}

const GATED_KINDS: readonly [string, SliceDefinition][] = [
  ['refused by its gate', gateSliceOf('refused')],
  ['blocked by its gate', gateSliceOf('blocked')],
  ['tip-locked', DENSE_ORE],
]

const [GATED] = surfaceOreTiles(1)
const ABOVE = { x: GATED.tx * 1000 + 500, y: (GATED.ty + 4) * 1000 + 500 }
const BELOW: TilePoint = { tx: GATED.tx, ty: GATED.ty - 1 }
/** The sweep runs this far down past the gated cell's top. */
const DESCENT_MM = 30_000

/** The rig reported at `ABOVE` facing down, then swept down at `speed` m/s, a tick at a time. */
function sweepDownAt(cut: SweepCut, speed: number): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...ABOVE } })
  const stepMm = Math.round((speed * MM_PER_METRE) / TICKS_PER_SECOND)
  // The first step rests at the start, so every later one continues its cursor's sweep.
  let state = sweepOneTick(cut, { ...session.state(), tick: 1 }, ABOVE.y)
  for (let moved = 1; moved * stepMm <= DESCENT_MM; moved++) {
    state = sweepOneTick(cut, { ...state, tick: 1 + moved }, ABOVE.y - stepMm * moved)
  }
  return state
}

function sweepOneTick(cut: SweepCut, state: AuthorityState, y: number): AuthorityState {
  const pose: VehiclePose = { ...(vehicleOf(state, 'p1').pose as VehiclePose), y }
  const step = { pose, drive: NO_DRIVE, isLifting: false }
  return cut(state, PARAMS, 'p1', noseTileOf(pose), step).state
}

describe.each(CUTS)('swept cut gates at any speed through %s (tickets 334, 374)', (_cut, cut) => {
  describe.each(GATED_KINDS)('a cell %s', (_kind, slice) => {
    it.each(SPEEDS_M_PER_S)('is never cut, nor the cell past it, at %i m/s', (speed) => {
      const state = withRegistrations([slice], () => sweepDownAt(cut, speed))
      const untouched = (tile: TilePoint) => cellDensitySum(EMPTY_WORLD, PARAMS, tile)
      expect(cellDensitySum(state.world, PARAMS, GATED)).toBe(untouched(GATED))
      expect(cellDensitySum(state.world, PARAMS, BELOW)).toBe(untouched(BELOW))
      const cursor = vehicleOf(state, 'p1').sweptCut
      expect(cursor?.yMm).toBeGreaterThanOrEqual((GATED.ty + 1) * 1000)
    })
  })

  it.each(SPEEDS_M_PER_S)('cuts past the same cell at %i m/s when nothing gates it', (speed) => {
    const state = sweepDownAt(cut, speed)
    expect(cellDensitySum(state.world, PARAMS, BELOW)).toBeLessThan(
      cellDensitySum(EMPTY_WORLD, PARAMS, BELOW),
    )
  })
})
