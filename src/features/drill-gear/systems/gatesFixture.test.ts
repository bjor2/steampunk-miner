import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  coreTiles,
  createScriptedSession,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { slice as DRILL_GEAR_SLICE } from '../register'
import { DRILL_GEAR_POWER_UPS } from './drillGearContent'
import { SAMPLING_CORER_ID } from './samplingCorer'

// #162 acceptance 3 for the drill-gear lane, as the GD lock on #205 Q4 (a) reads it: every item
// activated with a rig-gated, a dynamite-gated or a core cell next ahead of the bit leaves that
// cell (and every other) as it was. Only the corer acts on a cell, and each of the three blocks it,
// so power-up-core logs `power_up_blocked_by_gate` and gives the charge back (its drill.collar
// spec). A toggle's press only flips it and a head acts while slotted, so neither is blocked.
// The cutters and boom cut what the bit cuts once on, gated cells left standing: cuttersAndBoom.

const [RIG_GATED, DYNAMITE_GATED] = surfaceOreTiles(2)
const [CORE_CELL] = coreTiles(1)

/** Rig- and dynamite-gated as #142's `canMine` will call them. */
const GATE_PROBE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.rig-and-dynamite',
      check: ({ tile }) => {
        if (isTile(tile, RIG_GATED)) return gated('rig')
        if (isTile(tile, DYNAMITE_GATED)) return gated('dynamite')
        return null
      },
    }),
}

const TARGETS: readonly (readonly [string, TilePoint])[] = [
  ['rig-gated', RIG_GATED],
  ['dynamite-gated', DYNAMITE_GATED],
  ['core', CORE_CELL],
]

const CASES = DRILL_GEAR_POWER_UPS.flatMap((powerUp) =>
  TARGETS.map(([kind, tile]) => [powerUp.itemId, kind, tile] as const),
)

describe('drill-gear gates fixture', () => {
  it('puts the miner right above each target, which is an ore or core cell', () => {
    const kinds = TARGETS.map(([, tile]) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)))
    expect(kinds).toEqual([CELL_KIND.ore, CELL_KIND.ore, CELL_KIND.core])
  })

  it.each(CASES)('%s activated over a %s cell changes no cell', (itemId, _kind, tile) => {
    withRegistrations([DRILL_GEAR_SLICE, GATE_PROBE], () => {
      const state = minerAbove(tile)
      const outcome = activate(itemId, tile, state)
      const world = outcome.kind === 'acted' ? outcome.effect.state.world : state.world
      expect(world).toBe(state.world)
      expect(outcome.kind === 'blocked').toBe(itemId === SAMPLING_CORER_ID)
    })
  })

  it.each(TARGETS)('blocks the corer at the %s cell itself, naming its gate', (kind, tile) => {
    withRegistrations([DRILL_GEAR_SLICE, GATE_PROBE], () => {
      const outcome = activate(SAMPLING_CORER_ID, tile, minerAbove(tile))
      expect(outcome).toMatchObject({
        kind: 'blocked',
        block: { tx: tile.tx, ty: tile.ty, gateKind: kind.replace('-gated', '') },
      })
    })
  })
})

/** A session with every drill-gear item owned, the miner above `tile` facing down at it. */
function minerAbove(tile: TilePoint) {
  const session = createScriptedSession()
  const owned = DRILL_GEAR_POWER_UPS.map((powerUp) => powerUp.itemId)
  session.submit(0, setVehicleLoadoutCommand({}, owned))
  session.submit(1, poseAbove({ tx: tile.tx, ty: tile.ty + 1 }, FACING.down))
  return session.state()
}

function activate(itemId: string, tile: TilePoint, state: ReturnType<typeof minerAbove>) {
  const powerUp = DRILL_GEAR_POWER_UPS.find((candidate) => candidate.itemId === itemId)!
  const origin = { tx: tile.tx, ty: tile.ty + 2 }
  return powerUp.activate(state, {
    playerId: 'p1',
    itemId,
    slot: 'drill.collar',
    tick: 20,
    origin,
    mark: 0,
    magnitude: null,
  })
}

function gated(gateKind: string) {
  return { outcome: 'refused' as const, gateKind, required: gateKind, have: 'none' }
}

function isTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}
