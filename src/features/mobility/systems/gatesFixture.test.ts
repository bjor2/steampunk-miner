import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  coreTiles,
  createScriptedSession,
  PARAMS,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import { MM, poseAt } from '../mobilityTestSession'
import { slice as MOBILITY_SLICE } from '../register'
import { MOBILITY_POWER_UPS } from './mobilityPowerUps'

// #162 acceptance 3 for the mobility lane, as the GD lock on #204 Q5 reads it: every item used
// beside a rig-gated, a dynamite-gated and a core cell leaves each cell (and every other) as it
// was. No mobility item changes a cell, so none is ever blocked by a gate; the grapple hooks all
// three and breaks none. That a refusal spends no charge is the grapple's in-play spec.

const [RIG_GATED, DYNAMITE_GATED] = surfaceOreTiles(2)
const CORE_CELL = lowestCoreTileOfColumn(0)

/** Rig- and dynamite-gated as #142's `canMine` will call them; no mobility item asks. */
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

const CASES = MOBILITY_POWER_UPS.flatMap((powerUp) =>
  TARGETS.map(([kind, tile]) => [powerUp.itemId, kind, tile] as const),
)

describe('mobility gates fixture', () => {
  it('stands the miner in a pocket right under each target, which stays solid', () => {
    withRegistrations([MOBILITY_SLICE, GATE_PROBE], () => {
      const kinds = TARGETS.map(([, tile]) =>
        kindOfCell(cellAt(pocketUnder(tile).world, PARAMS, tile)),
      )
      expect(kinds).toEqual([CELL_KIND.ore, CELL_KIND.ore, CELL_KIND.core])
    })
  })

  it.each(CASES)(
    '%s beside a %s cell changes no cell and is never blocked',
    (itemId, _kind, tile) => {
      withRegistrations([MOBILITY_SLICE, GATE_PROBE], () => {
        const state = pocketUnder(tile)
        const powerUp = MOBILITY_POWER_UPS.find((candidate) => candidate.itemId === itemId)!
        const origin = { tx: tile.tx, ty: tile.ty - 2 }
        const outcome = powerUp.activate(state, {
          playerId: 'p1',
          itemId,
          slot: 'powerup.1',
          tick: 20,
          origin,
          mark: 0,
          magnitude: null,
        })
        expect(outcome.kind).not.toBe('blocked')
        if (outcome.kind === 'acted') expect(outcome.effect.state.world).toBe(state.world)
      })
    },
  )

  it.each(TARGETS)('hooks the %s cell with the grapple and leaves it standing', (_kind, tile) => {
    withRegistrations([MOBILITY_SLICE, GATE_PROBE], () => {
      const state = pocketUnder(tile)
      const grapple = MOBILITY_POWER_UPS.find(
        (powerUp) => powerUp.itemId === 'power.grapple_winch',
      )!
      const outcome = grapple.activate(state, {
        playerId: 'p1',
        itemId: grapple.itemId,
        slot: 'powerup.1',
        tick: 20,
        origin: { tx: tile.tx, ty: tile.ty - 2 },
        mark: 0,
        magnitude: null,
      })
      expect(outcome.kind).toBe('acted')
      if (outcome.kind !== 'acted') return
      expect(outcome.effect.events).toMatchObject([{ hookTx: tile.tx, hookTy: tile.ty }])
      expect(outcome.effect.state.world).toBe(state.world)
    })
  })
})

/** A session with every mobility item owned, the miner at rest in a pocket two tiles under `tile`. */
function pocketUnder(tile: TilePoint) {
  const session = createScriptedSession()
  const owned = MOBILITY_POWER_UPS.map((powerUp) => powerUp.itemId)
  session.submit(0, setVehicleLoadoutCommand({}, owned))
  const centre = { x: tile.tx * MM + MM / 2, y: (tile.ty - 2) * MM + MM / 2 }
  session.submit(1, carveCircleCommand({ ...centre, radius: 1600, amount: SOLID_DENSITY }))
  session.submit(1, poseAt(centre.x, centre.y, FACING.up))
  return session.state()
}

function lowestCoreTileOfColumn(tx: number): TilePoint {
  const reach = PARAMS.coreRadiusTiles
  for (let ty = -reach; ty <= reach; ty += 1) {
    if (kindOfCell(cellAt(EMPTY_WORLD, PARAMS, { tx, ty })) === CELL_KIND.core) return { tx, ty }
  }
  return coreTiles(1)[0]
}

function gated(gateKind: string) {
  return { outcome: 'refused' as const, gateKind, required: gateKind, have: 'none' }
}

function isTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}
