import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { GateOutcome, GateQuery, GateVerdict } from '../../registries/gateChecks'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import type { AuthorityState } from '../authorityState'
import { PARAMS } from '../scriptedSession'
import {
  MAGNET_SOURCE,
  magnetProbeSlice,
  oreWalls,
  playMagnetRun,
  probeOf,
  type WallAndCave,
} from './magnetFixtures'

// The Gates of the GD lock on #246 (ticket 283): magnets ask `canMine` like #205's drill gear, and
// never move a rig- or dynamite-gated cell, or its shell, out of the gate. Fake gate slices stand
// in for `mining-gates`, so the kernel rule is judged alone.

/** One gate over a set of tiles: any ore cell standing on one is held, for the drill and tools. */
function gateOver(gateKind: 'rig' | 'dynamite', tiles: readonly TilePoint[]): SliceDefinition {
  const held = new Set(tiles.map(keyOf))
  const verdict: GateVerdict = { outcome: 'refused', gateKind, required: gateKind, have: 'none' }
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: `gate-probe.${gateKind}`,
        check: ({ tile }) => (held.has(keyOf(tile)) ? verdict : null),
      }),
  }
}

/** A gate answering every ore cell with `answer`, for the magnet and the drill alike. */
function gateAnswering(answer: (query: GateQuery) => GateOutcome | null): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.every',
        check: (query) => {
          const outcome = answer(query)
          return outcome === null ? null : { outcome, gateKind: 'probe', required: 'x', have: 'y' }
        },
      }),
  }
}

function hasMoved(state: AuthorityState, { wall, cave }: WallAndCave): boolean {
  return (
    cellAt(state.world, PARAMS, cave) === cellAt(EMPTY_WORLD, PARAMS, wall) &&
    kindOfCell(cellAt(state.world, PARAMS, wall)) === CELL_KIND.air
  )
}

function hasStayed(state: AuthorityState, { wall, cave }: WallAndCave): boolean {
  return (
    cellAt(state.world, PARAMS, wall) === cellAt(EMPTY_WORLD, PARAMS, wall) &&
    kindOfCell(cellAt(state.world, PARAMS, cave)) === CELL_KIND.air
  )
}

function pushWith(pairs: readonly WallAndCave[], gate: SliceDefinition | null): AuthorityState {
  const probe = magnetProbeSlice(probeOf(pairs))
  return playMagnetRun(gate === null ? [probe] : [probe, gate])
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

describe('magnet gates', () => {
  it('a rig-gated or dynamite-gated cell and its shell stay inside the gate', () => {
    const pairs = oreWalls(4)
    expect(pairs.every((pair) => hasMoved(pushWith(pairs, null), pair))).toBe(true)
    for (const gateKind of ['rig', 'dynamite'] as const) {
      const gatedWalls = pushWith(
        pairs,
        gateOver(
          gateKind,
          pairs.map(({ wall }) => wall),
        ),
      )
      expect(pairs.every((pair) => hasStayed(gatedWalls, pair))).toBe(true)
      const gatedCaves = pushWith(
        pairs,
        gateOver(
          gateKind,
          pairs.map(({ cave }) => cave),
        ),
      )
      expect(pairs.every((pair) => hasStayed(gatedCaves, pair))).toBe(true)
    }
  })

  it('the field goes through canMine', () => {
    const pairs = oreWalls(2)
    const queries: GateQuery[] = []
    pushWith(
      pairs,
      gateAnswering((query) => (queries.push(query), null)),
    )
    for (const { wall } of pairs) {
      expect(queries).toContainEqual(
        expect.objectContaining({ tile: wall, tool: MAGNET_SOURCE, blast: null, playerId: 'p1' }),
      )
    }
    for (const outcome of ['refused', 'blocked', 'lost', 'cut'] as const) {
      const answered = pushWith(
        pairs,
        gateAnswering(({ tool }) => (tool === undefined ? null : outcome)),
      )
      expect(pairs.every((pair) => hasStayed(answered, pair))).toBe(true)
    }
  })

  it('a cell never moves where the drill would meet a gate it did not meet before', () => {
    const pairs = oreWalls(2)
    const caves = new Set(pairs.map(({ cave }) => keyOf(cave)))
    const drillGateAtCaves = gateAnswering(({ tile, tool }) =>
      tool === undefined && caves.has(keyOf(tile)) ? 'refused' : null,
    )
    const state = pushWith(pairs, drillGateAtCaves)
    expect(pairs.every((pair) => hasStayed(state, pair))).toBe(true)
  })
})
