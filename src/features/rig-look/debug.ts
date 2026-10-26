/**
 * The rig look's debug read (feature-slices.md 3.14), so a browser spec or a screen capture asserts
 * each track's look step without reading pixels: `getLooks` answers, per track of the table, the
 * local player's owned purchases and the band, step, finish band, pips, part, tint, finish and
 * hover line their rig shows,
 * from the same frames the vehicle look sources paint; `items` answers each drill type's item
 * track (ticket 623): its `n` and the parts it asks for. Read-only, so no command and no log line.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readRigItemLookReadings, readRigLookReadings } from './store/rigLookReads'

export const rigLookDebugActions: Readonly<Record<string, DebugAction>> = {
  getLooks: () => ({ ok: true, looks: readRigLookReadings(), items: readRigItemLookReadings() }),
}
