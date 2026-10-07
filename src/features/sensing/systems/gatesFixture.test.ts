import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { coreTiles, PARAMS, surfaceOreTiles } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { sensingSession, standInPocket } from '../sensingTestSession'
import { slice as SENSING_SLICE } from '../register'
import { assayReadingsOf } from './assayLens'
import { echoMarksOf } from './echoPing'
import { barometerWarningsOf } from './hazardBarometer'
import { SENSING_POWER_UPS } from './sensingPowerUps'
import { periscopeWarningsOf } from './threatPeriscope'

// #162 acceptance 3 for the sensing lane, as the GD ruling on #203 reads it under the #204 Q5
// lock: every item used beside a rig-gated, a dynamite-gated and a core cell leaves each cell
// (and every other) as it was. No sensing item changes a cell, so none is ever blocked by a gate
// and none spends a charge on a refusal; each scanner reads the gated cells and changes nothing.

const [RIG_GATED, DYNAMITE_GATED] = surfaceOreTiles(2)
const CORE_CELL = lowestCoreTileOfColumn(0)

/** Rig- and dynamite-gated as #142's `canMine` calls them; no sensing item asks. */
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

const CASES = SENSING_POWER_UPS.flatMap((powerUp) =>
  TARGETS.map(([kind, tile]) => [powerUp.itemId, kind, tile] as const),
)

describe('sensing gates fixture', () => {
  it('stands the miner in a pocket right under each target, which stays solid', () => {
    withRegistrations([SENSING_SLICE, GATE_PROBE], () => {
      const kinds = TARGETS.map(([, tile]) =>
        kindOfCell(cellAt(pocketUnder(tile).world, PARAMS, tile)),
      )
      expect(kinds).toEqual([CELL_KIND.ore, CELL_KIND.ore, CELL_KIND.core])
    })
  })

  it.each(CASES)(
    '%s beside a %s cell changes no cell and is never blocked',
    (itemId, _kind, tile) => {
      withRegistrations([SENSING_SLICE, GATE_PROBE], () => {
        const state = pocketUnder(tile)
        const powerUp = SENSING_POWER_UPS.find((candidate) => candidate.itemId === itemId)!
        const outcome = powerUp.activate(state, {
          playerId: 'p1',
          itemId,
          slot: 'powerup.1',
          tick: 20,
          origin: { tx: tile.tx, ty: tile.ty - 2 },
          mark: 0,
          magnitude: null,
        })
        expect(outcome.kind).not.toBe('blocked')
        if (outcome.kind === 'acted') expect(outcome.effect.state).toBe(state)
      })
    },
  )

  it.each(TARGETS)(
    'reads the %s cell with every scanner and leaves the state as it was',
    (_kind, tile) => {
      withRegistrations([SENSING_SLICE, GATE_PROBE], () => {
        const state = pocketUnder(tile)
        const before = stateDigest(state)
        echoMarksOf(state, { tx: tile.tx, ty: tile.ty - 2 }, 12)
        assayReadingsOf(state, 'p1', 12)
        barometerWarningsOf(state, 'p1', 10)
        periscopeWarningsOf(state, 'p1', 20)
        expect(stateDigest(state)).toBe(before)
      })
    },
  )
})

/** A session owning every sensing item, the miner at rest in a pocket two tiles under `tile`. */
function pocketUnder(tile: TilePoint): AuthorityState {
  const session = sensingSession()
  standInPocket(session, 1, { tx: tile.tx, ty: tile.ty - 2 })
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
