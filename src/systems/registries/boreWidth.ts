/**
 * The bore's one width source (GD lock on #662 Part B, ticket 749): each source answers the width
 * levels one player's rig owns now, read from what the host already keeps (its loadout, its tree),
 * and the kernel adds them up, so a future width item or module adds to the same number. There is
 * no client width field and no saved width: the host derives it every tick. The stamp reads it
 * (`authority/boreStamp.ts`), and the collider, look, mounts, wagons and camera are to read the same
 * level (`vehicle/drillBore.ts` turns it into metres). With nothing registered every rig is bare.
 */
import type { AuthorityState } from '../authority/authorityState'
import { BARE_WIDTH_LEVEL } from '../vehicle/drillBore'
import { defineRegistry, entriesOf } from './seal'

export interface BoreWidthSource {
  id: string
  /** The width levels this player's rig owns from this source now; 0 to add none. */
  widthLevelsOf(state: AuthorityState, playerId: string): number
}

export const BORE_WIDTH_REGISTRY = defineRegistry<BoreWidthSource>('boreWidth')

/** The player's width level: every source's whole levels added, never below the bare body. */
export function widthLevelOf(state: AuthorityState, playerId: string): number {
  return entriesOf(BORE_WIDTH_REGISTRY).reduce(
    (level, source) => level + wholeLevelsOf(source.widthLevelsOf(state, playerId)),
    BARE_WIDTH_LEVEL,
  )
}

function wholeLevelsOf(levels: number): number {
  return Math.max(0, Math.floor(levels))
}
