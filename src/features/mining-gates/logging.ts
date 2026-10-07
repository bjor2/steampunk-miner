/**
 * The mining gates' log lines (#142 acceptance 13): `mining-gates.gate_cleared {oreId, tier,
 * gateKind, method, units, value, tx, ty}` for every gated cell freed and `mining-gates.gate_ore_lost
 * {oreId, tier, units, cause, tx, ty}` for one lost without its extractor. A gate stopping the drill
 * is the kernel's `gate_hit`. The extractors' verbs log their beats (ticket 237): `ore_tuned`,
 * `tune_broken`, `mark_sprayed`, `canister_filled`, `pull_broken`, `lump_harpooned` and the dock's
 * `extractors_refilled`. The envelope already carries planet, depth and tick.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import { LOST_AS } from './systems/gateRows'
import './systems/gateEvents'
import './systems/verbEvents'

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
  'mining-gates.OreTuned': ({ tx, ty, cells, untilTick }) => ({
    event: 'mining-gates.ore_tuned',
    data: { tx, ty, cells, untilTick },
  }),
  'mining-gates.TuneBroken': ({ tx, ty }) => ({
    event: 'mining-gates.tune_broken',
    data: { tx, ty },
  }),
  'mining-gates.MarkSprayed': ({ tx, ty, readyAtTick, marksLeft }) => ({
    event: 'mining-gates.mark_sprayed',
    data: { tx, ty, readyAtTick, marksLeft },
  }),
  'mining-gates.CanisterFilled': ({ tx, ty, canistersLeft }) => ({
    event: 'mining-gates.canister_filled',
    data: { tx, ty, canistersLeft },
  }),
  'mining-gates.PullBroken': ({ tx, ty }) => ({
    event: 'mining-gates.pull_broken',
    data: { tx, ty },
  }),
  'mining-gates.LumpHarpooned': ({ tx, ty, oreId, tier }) => ({
    event: 'mining-gates.lump_harpooned',
    data: { tx, ty, oreId, tier },
  }),
  'mining-gates.ExtractorsRefilled': ({ canisters, marks }) => ({
    event: 'mining-gates.extractors_refilled',
    data: { canisters, marks },
  }),
}

/** A tile, as the verb lines name the cell they worked. */
const TILE = { tx: 'integer', ty: 'integer' } as const

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
  'mining-gates.ore_tuned': {
    group: 'mining',
    level: 'core',
    payload: { ...TILE, cells: 'integer', untilTick: 'integer' },
  },
  'mining-gates.tune_broken': { group: 'mining', level: 'core', payload: { ...TILE } },
  'mining-gates.mark_sprayed': {
    group: 'mining',
    level: 'core',
    payload: { ...TILE, readyAtTick: 'integer', marksLeft: 'integer' },
  },
  'mining-gates.canister_filled': {
    group: 'mining',
    level: 'core',
    payload: { ...TILE, canistersLeft: 'integer' },
  },
  'mining-gates.pull_broken': { group: 'mining', level: 'core', payload: { ...TILE } },
  'mining-gates.lump_harpooned': {
    group: 'mining',
    level: 'core',
    payload: { ...TILE, oreId: 'text', tier: 'integer' },
  },
  'mining-gates.extractors_refilled': {
    group: 'platform',
    level: 'core',
    payload: { canisters: 'integer', marks: 'integer' },
  },
}
