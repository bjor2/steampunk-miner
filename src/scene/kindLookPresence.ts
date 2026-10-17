/**
 * What the ground's material looks draw now (ticket 450), for the debug reads that check them in
 * e2e: the look table the terrain material was last given, and whether the debug API has asked
 * every kind to show as if seen (eye checks and the #526 frame A/B, which a fresh save could not
 * otherwise measure). Written by `terrainKindLooks` and the debug API; a mutable registry, never
 * React or the store. Presentation only: no command, no log line.
 */
import { emptyKindLookTable, type KindLookTable } from '../systems/render/kindLookTable'

export const kindLookPresence: {
  table: KindLookTable
  isEveryKindShown: boolean
} = {
  table: emptyKindLookTable(),
  isEveryKindShown: false,
}
