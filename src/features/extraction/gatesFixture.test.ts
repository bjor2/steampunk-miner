import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { coreMaterialTier } from '../../systems/economy/oreEconomy'
import type { TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../systems/world/worldState'
import { resourceTierOf } from '../../systems/authority/minedOre'
import { PARAMS } from '../../systems/authority/scriptedSession'
import { chargesLeftOf } from '../power-up-core'
import {
  ACT_TICK,
  DRAIN_ID,
  drainSessionAt,
  ofType,
  oreTilesAround,
  press,
  PRESS_TICK,
  standingTileWithOre,
} from './drainTestSession'
import { slice as EXTRACTION_SLICE } from './register'
import { EXTRACTION_POWER_UPS } from './systems/extractionContent'

// #162 acceptance 3 for the extraction lane: the drain used beside a rig-gated, a dynamite-gated
// and a core cell leaves each as it was, is blocked by it (`power_up_blocked_by_gate`) and spends
// no charge. The gated cells come from a probe gate check that gates every ore cell, as #142's
// `canMine` gates its own, asked with the drain as the tool; the core is the planet's own.

const ORIGIN = standingTileWithOre(1)
/** Inside planet 1's core disc, with only core in the drain's reach. */
const CORE_ORIGIN: TilePoint = { tx: 0, ty: 0 }

function probeGatingEveryOreAs(gateKind: string): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.every-ore',
        check: ({ tool }) =>
          tool === undefined
            ? null
            : { outcome: 'refused', gateKind, required: gateKind, have: 'none' },
      }),
  }
}

function activateDrainAt(state: AuthorityState, origin: TilePoint) {
  const [drain] = EXTRACTION_POWER_UPS
  return drain.activate(state, {
    playerId: 'p1',
    itemId: DRAIN_ID,
    slot: 'powerup.1',
    tick: ACT_TICK,
    origin,
    mark: 0,
    magnitude: null,
  })
}

function nearestOreTier(tile: TilePoint): number {
  const cell = cellAt(EMPTY_WORLD, PARAMS, tile)
  expect(kindOfCell(cell)).toBe(CELL_KIND.ore)
  return resourceTierOf(PARAMS, cell)
}

describe('extraction gates fixture', () => {
  it.each(['rig', 'dynamite'])(
    'is blocked by the nearest %s-gated cell and changes nothing',
    (gateKind) => {
      withRegistrations([EXTRACTION_SLICE, probeGatingEveryOreAs(gateKind)], () => {
        const session = drainSessionAt(ORIGIN)
        const [nearest] = oreTilesAround(ORIGIN)
        const outcome = activateDrainAt(session.state(), ORIGIN)
        expect(outcome).toEqual({
          kind: 'blocked',
          block: { cellTier: nearestOreTier(nearest), gateKind, ...nearest },
        })
      })
    },
  )

  it('is blocked by the core, as a refused use: nothing drained, no charge spent, the gate logged', () => {
    const session = drainSessionAt(CORE_ORIGIN)
    const worldBefore = session.state().world
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK + 4)
    expect(ofType(session.events(), 'power-up-core.PowerUpBlocked')).toMatchObject([
      { itemId: DRAIN_ID, gateKind: 'core', cellTier: coreMaterialTier(1), chargesLeft: 2 },
    ])
    expect(session.state().world).toBe(worldBefore)
    expect(chargesLeftOf(session.state(), 'p1', DRAIN_ID)).toBe(2)
  })
})
