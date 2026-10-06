import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import {
  createScriptedSession,
  mineTile,
  PARAMS,
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
        check: () => ({ outcome, gateKind: 'probe', required: 'probe-rig' }),
      }),
  }
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
})
