import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { oreCell, RESOURCE_FAMILY } from '../world/worldCell'
import { GATE_CHECK_REGISTRY, gateVerdictOf, type GateOutcome, type GateQuery } from './gateChecks'
import { addToRegistry, withFreshRegistrySet } from './seal'

const QUERY: GateQuery = {
  state: createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  playerId: 'p1',
  tile: { tx: 0, ty: 40 },
  cell: oreCell(RESOURCE_FAMILY.metal, 0),
  ore: {
    id: 'kernel.metal.t1',
    name: 'Metal ore, tier 1',
    family: 'metal',
    cellFamily: RESOURCE_FAMILY.metal,
    tier: 1,
    grade: 0,
    iconId: 'none',
    requires: [],
  },
  blast: null,
}

function registerCheck(id: string, outcome: GateOutcome | null): void {
  addToRegistry(GATE_CHECK_REGISTRY, 'mining-gates', {
    id,
    check: () =>
      outcome === null ? null : { outcome, gateKind: id, required: 'rig', have: 'none' },
  })
}

function verdictWith(checks: readonly [string, GateOutcome | null][]) {
  return withFreshRegistrySet(
    () => checks.forEach(([id, outcome]) => registerCheck(id, outcome)),
    () => gateVerdictOf(QUERY),
  )
}

describe('gate checks registry', () => {
  it('has no verdict when no check is registered', () => {
    expect(verdictWith([])).toBeNull()
  })

  it('has no verdict when every check has no opinion', () => {
    expect(verdictWith([['mining-gates.quiet', null]])).toBeNull()
  })

  it('lets refused win over lost and lost over cut', () => {
    expect(
      verdictWith([
        ['mining-gates.a', 'cut'],
        ['mining-gates.b', 'refused'],
        ['mining-gates.c', 'lost'],
      ])?.outcome,
    ).toBe('refused')
    expect(
      verdictWith([
        ['mining-gates.a', 'cut'],
        ['mining-gates.c', 'lost'],
      ])?.outcome,
    ).toBe('lost')
  })

  it('breaks a tie on the lowest check id, whatever order they were registered in', () => {
    const verdict = verdictWith([
      ['mining-gates.zeta', 'lost'],
      ['mining-gates.alpha', 'lost'],
    ])
    expect(verdict?.gateKind).toBe('mining-gates.alpha')
  })
})
