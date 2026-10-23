/**
 * The star map's addressing rules (ticket 754), the `starMap` block of economy.json: the GD lock on
 * #650 (comment 6361556890, TD architecture) and the VS input (6361573401). A planet is addressed
 * by its solar system `s` and its place `p` in it; the economy reads the campaign index
 * `g = campaignIndex(s, p)` (`starMap/campaignIndex.ts`), which advances by `systemAdvance` a system
 * ("g advancing by data J", VS), so system 1 is today's planet line.
 *
 * `systemAdvance` is provisional: no decision names its value, and ticket 759 (the jump between
 * systems) carries the J row and sets it. System 1 never reads it, so P1 onward stay byte-identical
 * whatever it holds.
 */
import type { FieldReader } from './economyFieldReader'

export interface StarMapRules {
  /** How far the campaign index moves from one solar system to the next (VS's J, provisional). */
  systemAdvance: number
}

const PATH = 'starMap'

export function readStarMap(reader: FieldReader, value: unknown): StarMapRules {
  const starMap = reader.object(PATH, value)
  const read = {
    systemAdvance: reader.safeInteger(`${PATH}.systemAdvance`, starMap.systemAdvance),
  }
  if (read.systemAdvance < 1) reader.record(`${PATH}.systemAdvance must be 1 or more`)
  return read
}
