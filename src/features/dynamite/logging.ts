/**
 * The dynamite log line (#153 consequence 2, the #189 lock): `dynamite.detonate_refused {reason,
 * size}` when the plunger clunks inside the interlock. A fired plunger is the kernel's
 * `charge_detonated {by: plunger}`. The envelope already carries planet, depth and tick.
 */
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
import './systems/dynamiteEvents'

export const DYNAMITE_PROJECTIONS: SliceEventProjections = {
  'dynamite.DetonateRefused': ({ reason, size }) => ({
    event: 'dynamite.detonate_refused',
    data: { reason, size },
  }),
}

export const DYNAMITE_RUN_EVENTS: SliceRunEvents = {
  'dynamite.detonate_refused': {
    group: 'mining',
    level: 'core',
    payload: { reason: { oneOf: ['in_radius'] }, size: 'integer' },
  },
}
