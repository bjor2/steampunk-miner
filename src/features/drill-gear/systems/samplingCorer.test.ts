import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import {
  coreTiles,
  createScriptedSession,
  PARAMS,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CORE_GATE_KIND, SAMPLING_CORER_ID, sampleOreAhead } from './samplingCorer'
import { resourceTierOf } from '../../../systems/authority/minedOre'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'

/** Planet-1 ground whose next cell down is an ore cell. */
const ABOVE_ORE: TilePoint = { tx: 30, ty: 280 }
const ORE: TilePoint = { tx: 30, ty: 279 }
/** Ground with only ground for more than the corer's reach below it. */
const ABOVE_GROUND: TilePoint = { tx: 30, ty: 288 }

/** A #142 gate of `gateKind` on one ore tile, refusing the drill there. */
function gateOn(tile: TilePoint, gateKind: string, outcome: 'refused' | 'cut'): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.one-tile',
        check: (query) =>
          query.tile.tx === tile.tx && query.tile.ty === tile.ty
            ? { outcome, gateKind, required: '1', have: '0' }
            : null,
      }),
  }
}

/** The corer's act with the vehicle above `tile` facing down, under `slices`. */
function coreDownFrom(tile: TilePoint, slices: readonly SliceDefinition[] = []) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    session.submit(1, poseAbove(tile, FACING.down))
    const state = session.state()
    const use = {
      playerId: 'p1',
      itemId: SAMPLING_CORER_ID,
      slot: 'drill.collar' as const,
      tick: 1,
      origin: tile,
      mark: 0,
      magnitude: null,
    }
    return { state, outcome: sampleOreAhead(state, use) }
  })
}

function tierAt(tile: TilePoint): number {
  return resourceTierOf(PARAMS, cellAt(EMPTY_WORLD, PARAMS, tile))
}

describe('sampling corer', () => {
  it('draws a plug from the first ore cell ahead and leaves the world as it was', () => {
    const { state, outcome } = coreDownFrom(ABOVE_ORE)
    expect(outcome).toEqual({
      kind: 'acted',
      effect: {
        state,
        events: [
          expect.objectContaining({ type: 'drill-gear.OreSampled', playerId: 'p1', ...ORE }),
        ],
      },
    })
  })

  it('reaches through rock to an ore cell six cells past the bit', () => {
    const { outcome } = coreDownFrom({ tx: ORE.tx, ty: ORE.ty + 6 })
    expect(outcome.kind === 'acted' && outcome.effect.events).toEqual([
      expect.objectContaining({ type: 'drill-gear.OreSampled', ...ORE }),
    ])
  })

  it('comes back empty when no ore lies within its reach', () => {
    const { state, outcome } = coreDownFrom(ABOVE_GROUND)
    expect(outcome).toEqual({ kind: 'acted', effect: { state, events: [] } })
  })

  it.each(['rig', 'dynamite'])('is refused by a %s-gated ore cell', (gateKind) => {
    const { outcome } = coreDownFrom(ABOVE_ORE, [gateOn(ORE, gateKind, 'refused')])
    expect(outcome).toEqual({
      kind: 'blocked',
      block: { cellTier: tierAt(ORE), gateKind, ...ORE },
    })
  })

  it('samples an ore cell whose gate lets the drill cut it', () => {
    const { outcome } = coreDownFrom(ABOVE_ORE, [gateOn(ORE, 'rig', 'cut')])
    expect(outcome.kind).toBe('acted')
  })

  it('is refused by a core cell', () => {
    const [core] = coreTiles(1)
    const { outcome } = coreDownFrom({ tx: core.tx, ty: core.ty + 1 })
    expect(outcome).toEqual({
      kind: 'blocked',
      block: { cellTier: tierAt(core), gateKind: CORE_GATE_KIND, ...core },
    })
  })
})
