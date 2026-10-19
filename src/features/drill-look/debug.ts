/**
 * The drill look's debug read (feature-slices.md 3.14), so a browser spec asserts the look step
 * without reading pixels: `getLook` answers the local player's `drill_power` purchases and the
 * stage and colour their drill shows, from the same rule the vehicle look source paints. Read-only,
 * so no command and no log line.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readDrillLookReading } from './store/drillLookReads'

export const drillLookDebugActions: Readonly<Record<string, DebugAction>> = {
  getLook: () => ({ ok: true, ...readDrillLookReading() }),
}
