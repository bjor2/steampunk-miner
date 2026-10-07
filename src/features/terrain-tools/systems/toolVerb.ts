/**
 * How one use of a terrain tool acts (the GD lock on #256): plain, or as the Mark milestone it
 * follows with (a second tap or a hold), and at its own Mark's size or, fired by a sibling-link, at
 * the link's reduced size. Every tool here is an income item, so a second tap and a hold change
 * only where or how it works, never its size, cap, cooldown or charges; the link is its one yield
 * step (`terrainMilestones.ts`).
 */
import type { FollowUpPattern, PowerUpUse } from '../../power-up-core'
import type { EditKey } from './editSeed'
import { magnitudeAt } from './itemMagnitude'
import type { TerrainItem } from './terrainItems'

export interface ToolVerb {
  /** The follow-up this use is; null for a plain use. */
  milestone: FollowUpPattern | null
  /** The size a sibling-link fired the tool at (power-up-core halves it); null for its own. */
  linkedSize: number | null
}

export const PLAIN_VERB: ToolVerb = { milestone: null, linkedSize: null }

export function toolVerbOf(use: PowerUpUse): ToolVerb {
  return {
    milestone: use.milestone ?? null,
    linkedSize: use.linkedFrom === undefined ? null : (use.magnitude ?? 0),
  }
}

export function isSecondTap(verb: ToolVerb): boolean {
  return verb.milestone === 'second-tap'
}

export function isHold(verb: ToolVerb): boolean {
  return verb.milestone === 'hold'
}

/** The size the tool works at: its Mark's, or the link's. */
export function sizeOf(item: TerrainItem, key: EditKey, verb: ToolVerb): number {
  return verb.linkedSize ?? magnitudeAt(item, key.mark)
}
