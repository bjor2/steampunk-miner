import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { readAuthorityState } from '../store/authorityLink'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { buildIntent } from '../systems/input/buildIntent'
import { cellDensitySum } from '../systems/world/cellYield'
import type { TilePoint } from '../systems/world/tileGrid'
import { EMPTY_WORLD } from '../systems/world/worldState'
import { createRig, type TickRead } from './cutFollowFixtures'

// A cut under way bites on the stamp its drill step cuts (ticket 397, Q3 of the GD and TD rulings
// on #397): past about a cell a tick the swept cut has already cleared the report's short stamp,
// so a contact read on that stamp alone answered `none` on some ticks, sent no drill step and lost
// the tick's work. The bite asks nothing of the gates itself: the authority still judges every
// cell the step's stamp meets, so a gated cell inside the swept stamp stays standing and reports
// its gate hit (the Horizontal Scaler's gate rule, TD condition 2).

/** The 44 m/s rig on planet 1 (#400's rig 1; no tile floor since ticket 397). */
const RIG_44 = { drill_power: 300, drill_tip: 200 }
const FRAME_RATES = [30, 144]
const DOWN_SECONDS = 2
/**
 * The followed ticks judged: some 22 m of solid ground at 44 m/s, above the first cave this
 * column meets. Read on the report's stamp alone, 2 to 3 of them sent no drill step.
 */
const FOLLOWED_TICKS = 30

let sink: MemorySink

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

/** Off the pad, then down for `DOWN_SECONDS`; the down leg's ticks. */
function cutDown(framesPerSecond: number): TickRead[] {
  const rig = createRig(RAPIER, RIG_44, framesPerSecond)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(buildIntent(['aim_left']), ticks(2))
  return rig.hold(buildIntent(['aim_down']), ticks(DOWN_SECONDS))
}

/** The down leg's first `FOLLOWED_TICKS` ticks from its first followed tick. */
function followedPartOf(down: readonly TickRead[]): TickRead[] {
  const first = down.findIndex((tick) => tick.result.isCutting)
  return first < 0 ? [] : down.slice(first, first + FOLLOWED_TICKS)
}

/** A fake slice refusing the drill every ore cell (feature-slices.md 3.6). */
const REFUSE_EVERY_ORE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.every-ore',
      check: () => ({ outcome: 'refused', gateKind: 'probe', required: 'probe-rig', have: 'none' }),
    }),
}

/** The cells the run log reported a gate hit on. */
function gateHitTilesOf(log: MemorySink): TilePoint[] {
  return log.events.flatMap((event) => {
    if (event.event !== 'gate_hit') return []
    const { tx, ty } = event.data as { tx: number; ty: number }
    return [{ tx, ty }]
  })
}

/** Whether the cell holds all the ground it was generated with. */
function isUncut(tile: TilePoint): boolean {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return false
  return cellDensitySum(state.world, params, tile) === cellDensitySum(EMPTY_WORLD, params, tile)
}

describe('a followed cut bites on its swept stamp (ticket 397)', () => {
  it.each(FRAME_RATES)(
    'the 44 m/s rig bites on every one of its first 30 followed down ticks, at %i frames/s',
    (framesPerSecond) => {
      const followed = followedPartOf(cutDown(framesPerSecond))
      expect(followed.length).toBe(FOLLOWED_TICKS)
      expect(followed.filter((tick) => !tick.result.flags.isDrilling)).toEqual([])
    },
    120_000,
  )

  it('leaves a gated cell the swept stamp meets standing, and reports its gate hit', () => {
    const followed = withRegistrations([REFUSE_EVERY_ORE], () => followedPartOf(cutDown(30)))
    expect(followed.length).toBeGreaterThan(0)
    const gated = gateHitTilesOf(sink)
    expect(gated.length).toBeGreaterThan(0)
    expect(gated.filter((tile) => !isUncut(tile))).toEqual([])
  }, 120_000)
})
