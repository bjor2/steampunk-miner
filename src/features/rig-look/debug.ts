/**
 * The rig look's debug read (feature-slices.md 3.14), so a browser spec or a screen capture asserts
 * each track's look step without reading pixels: `getLooks` answers, per track of the table, the
 * local player's owned purchases and the step, tail step, part, tint and plating their rig shows,
 * from the same frames the vehicle look sources paint. Read-only, so no command and no log line.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readRigLookReadings } from './store/rigLookReads'

export const rigLookDebugActions: Readonly<Record<string, DebugAction>> = {
  getLooks: () => ({ ok: true, looks: readRigLookReadings() }),
}
