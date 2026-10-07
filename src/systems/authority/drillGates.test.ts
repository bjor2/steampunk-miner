import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { oreTypeOf } from '../registries/oreTypes'
import { FACING } from '../vehicle/vehiclePose'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { resourceTierOf } from './minedOre'
import {
  createScriptedSession,
  drill,
  mineTile,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  typesOf,
} from './scriptedSession'

// The drill asks the slices' gate checks about ore cells (feature-slices.md 3.6); a fake slice
// registers one through withRegistrations, so no real slice is imported.

const [ORE_TILE] = surfaceOreTiles(1)

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

/** The kernel's ore on the probed tile, as `DrillGated` names it. */
function oreOnTile() {
  const cell = cellAt(EMPTY_WORLD, PARAMS, ORE_TILE)
  return oreTypeOf({ tier: resourceTierOf(PARAMS, cell), cellFamily: familyOfCell(cell) })
}

function drillGatedOf(events: readonly DomainEvent[]) {
  return events.filter((event) => event.type === 'DrillGated')
}

/** Mines the surface ore tile with only `slices` registered. */
function mineOreWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    const events = mineTile(session, 1, ORE_TILE)
    return {
      types: typesOf(events),
      cargo: session.vehicle().cargo.ore,
      cellKind: kindOfCell(cellAt(session.state().world, PARAMS, ORE_TILE)),
    }
  })
}

describe('drill gates', () => {
  it('collects the ore cell into the hold when no gate check is registered', () => {
    const mined = mineOreWith([])
    expect(mined.types).toEqual(expect.arrayContaining(['TileDestroyed', 'CargoAdded']))
    expect(Object.values(mined.cargo)).toEqual([1])
  })

  it('takes the same path when every gate check cuts the cell', () => {
    expect(mineOreWith([gateSliceOf('cut')])).toEqual(mineOreWith([]))
  })

  it('leaves an ore cell a gate refuses undrilled', () => {
    const mined = mineOreWith([gateSliceOf('refused')])
    expect(mined.types).not.toContain('TileDestroyed')
    expect(mined.cellKind).toBe(CELL_KIND.ore)
    expect(mined.cargo).toEqual({})
  })

  it('destroys an ore cell a gate says is lost without putting cargo in the hold', () => {
    const mined = mineOreWith([gateSliceOf('lost')])
    expect(mined.types).toContain('TileDestroyed')
    expect(mined.types).not.toContain('CargoAdded')
    expect(mined.cargo).toEqual({})
  })

  it('reports an ore cell a gate refuses as one DrillGated naming the ore and the verdict (K2)', () => {
    const { ore, events } = withRegistrations([gateSliceOf('refused')], () => ({
      ore: oreOnTile(),
      events: mineTile(createScriptedSession(), 1, ORE_TILE),
    }))
    expect(drillGatedOf(events)).toEqual([
      expect.objectContaining({
        type: 'DrillGated',
        ...ORE_TILE,
        oreId: ore.id,
        family: ore.family,
        tier: ore.tier,
        gateKind: 'probe',
        outcome: 'refused',
        required: 'probe-rig',
        have: 'none',
      }),
    ])
  })

  it('charges no energy for a drill command a gate refused', () => {
    const energies = withRegistrations([gateSliceOf('refused')], () => {
      const session = createScriptedSession()
      session.submit(1, poseAbove(ORE_TILE, FACING.down))
      const before = session.vehicle().energy
      session.submit(41, drill(ORE_TILE, 40))
      return { before, after: session.vehicle().energy }
    })
    expect(energies.after).toBe(energies.before)
  })

  it('reports the refused cell again on every drill command that meets it', () => {
    const events = withRegistrations([gateSliceOf('refused')], () => {
      const session = createScriptedSession()
      session.submit(1, poseAbove(ORE_TILE, FACING.down))
      return [
        ...session.submit(41, drill(ORE_TILE, 40)),
        ...session.submit(81, drill(ORE_TILE, 40)),
      ]
    })
    expect(drillGatedOf(events)).toHaveLength(2)
  })

  it('reports a refused ore cell under the drill stamp while the ground round it carves', () => {
    const events = withRegistrations([gateSliceOf('refused')], () => {
      const session = createScriptedSession()
      session.submit(1, poseAbove(ORE_TILE, FACING.down))
      return session.submit(13, poseAbove(ORE_TILE, FACING.down, { drillTicks: 12 }))
    })
    expect(drillGatedOf(events)).toContainEqual(
      expect.objectContaining({ ...ORE_TILE, outcome: 'refused' }),
    )
    expect(typesOf(events)).toContain('DrillDamageDealt')
  })

  it('reports an ore cell a gate says is lost right after its TileDestroyed (K2)', () => {
    const events = withRegistrations([gateSliceOf('lost')], () =>
      mineTile(createScriptedSession(), 1, ORE_TILE),
    )
    const types = typesOf(events)
    expect(drillGatedOf(events)).toEqual([
      expect.objectContaining({ ...ORE_TILE, outcome: 'lost', gateKind: 'probe' }),
    ])
    expect(types.indexOf('DrillGated')).toBe(types.indexOf('TileDestroyed') + 1)
  })

  it('reports nothing for an ore cell a gate cuts', () => {
    const events = withRegistrations([gateSliceOf('cut')], () =>
      mineTile(createScriptedSession(), 1, ORE_TILE),
    )
    expect(drillGatedOf(events)).toEqual([])
  })
})
