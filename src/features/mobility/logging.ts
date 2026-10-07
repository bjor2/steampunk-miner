/**
 * The mobility lines (#162 section 2.4: the envelope carries planet, depth and tick). Every use is
 * already `power-up-core.power_up_used`; these add what the use did: where a grapple hooked, and
 * whether a rivet patch plated the hull or was cancelled by a move.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/mobilityEvents'

export const MOBILITY_PROJECTIONS: SliceEventProjections = {
  'mobility.GrappleHooked': ({ hookTx, hookTy, toTx, toTy }) => ({
    event: 'mobility.grapple_hooked',
    data: { hook: { tx: hookTx, ty: hookTy }, to: { tx: toTx, ty: toTy } },
  }),
  'mobility.HullPatched': ({ amount, hullAfter }) => ({
    event: 'mobility.hull_patched',
    data: { amount, hullAfter },
  }),
  'mobility.PatchCancelled': ({ chargesLeft }) => ({
    event: 'mobility.patch_cancelled',
    data: { chargesLeft },
  }),
}

export const MOBILITY_RUN_EVENTS: SliceRunEvents = {
  'mobility.grapple_hooked': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { hook: { mapOf: 'integer' }, to: { mapOf: 'integer' } },
  },
  'mobility.hull_patched': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { amount: 'money', hullAfter: 'money' },
  },
  'mobility.patch_cancelled': {
    group: 'vehicle_and_combat',
    level: 'core',
    payload: { chargesLeft: 'integer' },
  },
}
