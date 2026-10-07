import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { GateOutcome, GateQuery } from '../../registries/gateChecks'
import { cellDensitySum } from '../../world/cellYield'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import type { CommandRule } from '../commandRule'
import { createScriptedSession, PARAMS, surfaceOreTiles } from '../scriptedSession'
import { queueTerrainEdit } from './terrainEdits'

// A power-up's terrain edit asks the gates about every ore cell it touches (#142 "Constraints on
// other systems", #236); fake slices register the edit command and a gate through
// withRegistrations, so no real slice is imported.
declare module '../authorityCommand' {
  interface CommandPayloads {
    'tool-probe.clear': Record<string, never>
  }
}

const [ORE_TILE] = surfaceOreTiles(1)
/** A plain ground tile beside the ore, so the edit has a cell no gate is asked about. */
const GROUND_TILE = groundTileNear(ORE_TILE)
const TOOL_SOURCE = 'tool-probe.drain'

const CLEAR: CommandRule<'tool-probe.clear'> = {
  fields: {},
  apply: (state, { playerId }) => ({
    state: queueTerrainEdit(state, {
      playerId,
      source: TOOL_SOURCE,
      cells: [ORE_TILE, GROUND_TILE].map((tile) => ({ kind: 'density', ...tile, density: 0 })),
    }),
    events: [],
  }),
}

const TOOL_SLICE: SliceDefinition = {
  id: 'tool-probe',
  register: (r) => r.commandRules({ 'tool-probe.clear': CLEAR }),
}

function gateSliceOf(answer: (query: GateQuery) => GateOutcome | null): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.tools',
        check: (query) => {
          const outcome = answer(query)
          return outcome === null ? null : { outcome, gateKind: 'probe', required: 'x', have: 'y' }
        },
      }),
  }
}

function groundTileNear(tile: TilePoint): TilePoint {
  for (let dx = 1; dx < 8; dx++) {
    const next = { tx: tile.tx + dx, ty: tile.ty }
    if (kindOfCell(cellAt(EMPTY_WORLD, PARAMS, next)) === CELL_KIND.ground) return next
  }
  throw new Error('no ground tile beside the ore')
}

/** Queues one edit over the ore and the ground tile, then lets the clock apply it. */
function clearWith(gate: SliceDefinition | null) {
  const slices = gate === null ? [TOOL_SLICE] : [TOOL_SLICE, gate]
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    session.submit(1, { type: 'tool-probe.clear', payload: {} })
    session.submit(3, { type: 'debug.setEnergy', payload: { energy: '10' } })
    const world = session.state().world
    return {
      ore: cellDensitySum(world, PARAMS, ORE_TILE),
      ground: cellDensitySum(world, PARAMS, GROUND_TILE),
    }
  })
}

describe('terrain edit gates', () => {
  it('clears an ore cell a power-up edit names when no gate is registered', () => {
    expect(clearWith(null)).toEqual({ ore: 0, ground: 0 })
  })

  it.each(['refused', 'blocked', 'lost'] as const)(
    'leaves an ore cell a gate answers %s to standing, and clears the rest of the edit',
    (outcome) => {
      const cleared = clearWith(gateSliceOf(() => outcome))
      expect(cleared.ore).toBe(fullOre())
      expect(cleared.ground).toBe(0)
    },
  )

  it('clears an ore cell a gate cuts for the tool', () => {
    expect(clearWith(gateSliceOf(() => 'cut')).ore).toBe(0)
  })

  it('names the edit as the tool asking, with no blast', () => {
    const queries: GateQuery[] = []
    clearWith(gateSliceOf((query) => (queries.push(query), null)))
    expect(queries).toContainEqual(
      expect.objectContaining({ tile: ORE_TILE, tool: TOOL_SOURCE, blast: null, playerId: 'p1' }),
    )
  })
})

function fullOre(): number {
  return cellDensitySum(EMPTY_WORLD, PARAMS, ORE_TILE)
}
