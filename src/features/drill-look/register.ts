/**
 * The drill look slice (#554, GD on #551 point 9): a steady glow on the drill's bit and head that
 * steps up at fixed `drill_power` purchase thresholds (`drillLook.json`), painted through the
 * kernel's `vehicleLooks`. Cosmetic only: no command, event, log line, save section or stat.
 * No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { drillLookDebugActions } from './debug'
import { createDrillLookSource } from './systems/drillLookSource'

export const slice: SliceDefinition = {
  id: 'drill-look',
  register(r) {
    r.vehicleLook(createDrillLookSource())
    // steampunkDebug.features['drill-look'].getLook()
    r.debugActions(drillLookDebugActions)
  },
}
