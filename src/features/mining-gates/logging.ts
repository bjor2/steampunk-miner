/**
 * The mining gates' log lines (#142 acceptance 13): `mining-gates.gate_cleared {oreId, tier,
 * gateKind, method, units, value, tx, ty}` for every gated cell freed and `mining-gates.gate_ore_lost
 * {oreId, tier, units, cause, tx, ty}` for one lost without its extractor. A gate stopping the drill
 * is the kernel's `gate_hit`. The envelope already carries planet, depth and tick.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import { LOST_AS } from './systems/gateRows'
import './systems/gateEvents'

const GATE_KINDS = ['drill', 'rig', 'dynamite']

export const MINING_GATES_PROJECTIONS: SliceEventProjections = {
  'mining-gates.GateCleared': ({ oreId, tier, gateKind, method, units, value, tx, ty }) => ({
    event: 'mining-gates.gate_cleared',
    data: { oreId, tier, gateKind, method, units, value, tx, ty },
  }),
  'mining-gates.GateOreLost': ({ oreId, tier, units, cause, tx, ty }) => ({
    event: 'mining-gates.gate_ore_lost',
    data: { oreId, tier, units, cause, tx, ty },
  }),
}

export const MINING_GATES_RUN_EVENTS: SliceRunEvents = {
  'mining-gates.gate_cleared': {
    group: 'mining',
    level: 'core',
    payload: {
      oreId: 'text',
      tier: 'integer',
      gateKind: { oneOf: GATE_KINDS },
      method: { oneOf: GATE_KINDS },
      units: 'integer',
      value: 'money',
      tx: 'integer',
      ty: 'integer',
    },
  },
  'mining-gates.gate_ore_lost': {
    group: 'mining',
    level: 'core',
    payload: {
      oreId: 'text',
      tier: 'integer',
      units: 'integer',
      cause: { oneOf: LOST_AS },
      tx: 'integer',
      ty: 'integer',
    },
  },
}
