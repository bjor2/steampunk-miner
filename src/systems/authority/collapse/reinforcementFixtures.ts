/**
 * A fake reinforcing slice for the ground reinforcement specs (ticket 365), registered through
 * `withRegistrations` so no real slice is imported. Its provider answers from the cells and the
 * tick it was built with, standing in for a provider's own saved section; a fake gate check names
 * a gate kind for chosen ore cells, standing in for `mining-gates`.
 */
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { GateCheck } from '../../registries/gateChecks'
import type { ReinforcementProvider } from '../../registries/groundReinforcement'
import type { TilePoint } from '../../world/tileGrid'

export const PROBE_PROVIDER_ID = 'reinforce-probe.cells'

export interface ReinforcementProbe {
  /** The cells it reinforces; absent: every cell. */
  cells?: readonly TilePoint[]
  /** The first tick it answers; 0 by default. */
  fromTick?: number
  /** Gate kinds the fake gate check names, by `tx,ty`. */
  gates?: Readonly<Record<string, string>>
  /** Answers false everywhere, for an OR across providers. */
  alsoRefusing?: boolean
}

export function reinforcementProbeSlice(probe: ReinforcementProbe = {}): SliceDefinition {
  return {
    id: 'reinforce-probe',
    register(r) {
      if (probe.alsoRefusing === true) r.reinforcement(refusingProvider())
      r.reinforcement(providerOf(probe))
      if (probe.gates !== undefined) r.gateCheck(gateCheckOf(probe.gates))
    },
  }
}

export function keyOfTile({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

function providerOf({ cells, fromTick = 0 }: ReinforcementProbe): ReinforcementProvider {
  const keys = cells === undefined ? null : new Set(cells.map(keyOfTile))
  return {
    id: PROBE_PROVIDER_ID,
    reinforces: (state, tx, ty) =>
      state.tick >= fromTick && (keys === null || keys.has(keyOfTile({ tx, ty }))),
  }
}

function refusingProvider(): ReinforcementProvider {
  return { id: 'reinforce-probe.none', reinforces: () => false }
}

function gateCheckOf(gates: Readonly<Record<string, string>>): GateCheck {
  return {
    id: 'reinforce-probe.gates',
    check: ({ tile }) => {
      const gateKind = gates[keyOfTile(tile)]
      if (gateKind === undefined) return null
      return { outcome: 'refused', gateKind, required: 'probe', have: 'none' }
    },
  }
}
