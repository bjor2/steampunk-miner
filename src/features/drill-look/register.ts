/**
 * The drill look slice (#554, GD on #551 point 9): a steady glow on the drill's bit and head that
 * steps up at fixed `drill_power` purchase thresholds. Since ticket 577 the rows are the
 * `drill_power` block of the rig look table and `rig-look` paints them, so this slice keeps only
 * its stage rule and its debug read. Cosmetic only: no command, event, log line, save section or
 * stat. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { drillLookDebugActions } from './debug'

export const slice: SliceDefinition = {
  id: 'drill-look',
  register(r) {
    // steampunkDebug.features['drill-look'].getLook()
    r.debugActions(drillLookDebugActions)
  },
}
