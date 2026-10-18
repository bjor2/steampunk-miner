import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import type { TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'

// The drill step's facing (ticket 506, Horizontal Scaler): the fresh facing changes only when a
// cut starts, never which cells a pose cuts, their order, or any gate. A route of steps that all
// face down cuts alike whether the last report faced down, as on main, where the step took the
// report's facing, or left, a turn the report has not caught up with. FeatureUnlocked and artefact
// picks come from commands (travel, chooseArtefact), never from a cut, so a drill route carries the
// cell events: ore firsts (`codex.*`), TileDestroyed, CargoAdded and DrillGated.

/** A surface ore column; the route starts four tiles above its ore cell. */
const [ORE] = surfaceOreTiles(1)
const ABOVE = { x: ORE.tx * 1000 + 500, y: (ORE.ty + 4) * 1000 + 500 }
const BELOW_ORE: TilePoint = { tx: ORE.tx, ty: ORE.ty - 1 }
const ROUTE_TICKS = 60

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

/** A drill that breaks band-1 ground in about 4 ticks and a full tank, reported facing `facing`. */
function strongSessionReported(facing: Facing): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 12 } })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, facing)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...ABOVE } })
  return session
}

/** The fixed route: a step facing down every tick, down the ore column at the cutting bound. */
function cutRouteDown(reported: Facing): ScriptedSession {
  const session = strongSessionReported(reported)
  const stepMm = stepBoundsAt(session.state(), 'p1').cuttingMm
  for (let tick = 1; tick <= ROUTE_TICKS; tick++) {
    const payload = { x: ABOVE.x, y: ABOVE.y - stepMm * tick, facing: FACING.down, drive: NO_DRIVE }
    session.submit(tick, { type: 'drillStep', payload })
  }
  return session
}

/** The same route with only a gate refusing every ore cell registered (kernel specs import no slice). */
function cutRouteAgainstGate(reported: Facing): ScriptedSession {
  return withRegistrations([gateSliceOf('refused')], () => cutRouteDown(reported))
}

const isOreFirst = (event: DomainEvent) => event.type.startsWith('codex.Ore')

function isGatedAt(event: DomainEvent, tile: TilePoint): boolean {
  return event.type === 'DrillGated' && event.tx === tile.tx && event.ty === tile.ty
}

type Route = (reported: Facing) => ScriptedSession

const ROUTES: readonly [string, Route, (event: DomainEvent) => boolean][] = [
  ['through the ore with the loaded slices', cutRouteDown, isOreFirst],
  ['against a gated ore cell', cutRouteAgainstGate, (event) => isGatedAt(event, ORE)],
]

describe('drill step facing (ticket 506, Horizontal Scaler)', () => {
  it.each(ROUTES)(
    'the event stream (FeatureUnlocked, ore firsts, artefact picks, DrillGated) matches main’s on a fixed route with drill.sweptCut on, in walk order: %s',
    (_, cutRoute, isCellEvent) => {
      const asOnMain = cutRoute(FACING.down).events()
      const turned = cutRoute(FACING.left).events()
      expect(asOnMain.filter(isCellEvent).length).toBeGreaterThan(0)
      expect(asOnMain.filter((event) => event.type === 'CommandRejected')).toEqual([])
      expect(turned).toEqual(asOnMain)
    },
  )

  it('a gated cell is never cut and still emits DrillGated when the step carries a fresh facing', () => {
    const session = cutRouteAgainstGate(FACING.left)
    const world = session.state().world
    expect(session.events().some((event) => isGatedAt(event, ORE))).toBe(true)
    for (const tile of [ORE, BELOW_ORE]) {
      expect(cellDensitySum(world, PARAMS, tile)).toBe(cellDensitySum(EMPTY_WORLD, PARAMS, tile))
    }
  })
})
