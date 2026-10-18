/**
 * How a seen material's rarity reads in a panel (ticket 454 under #139): its name in the tint the
 * ground frames that rarity in (`rarityLooks.json`), a frame in the same tint, and a word. Epic
 * and mythic, whose ground glow pulses, pulse their name's glow too; with reduce motion (the shake
 * switch, as for the vehicle's part motion, #33) the glow holds still and only the static colour
 * and frame show. Common shows its word with no tint. An unspecified rarity shows nothing, so a
 * panel draws the name as it did before materials.
 */
import type { Rgb } from '../render/colour'
import type { SeenRarity } from '../render/seenRarity'

export interface RarityName {
  rarity: string
  /** "Rare": the tier's id with a capital. */
  word: string
  /** CSS colour of the name and frame; null for common. */
  tint: string | null
  isPulsing: boolean
}

const CHANNEL_MAX = 255

export function rarityNameOf(seen: SeenRarity | null, isMotionReduced: boolean): RarityName | null {
  if (seen === null) return null
  return {
    rarity: seen.rarity,
    word: wordOf(seen.rarity),
    tint: seen.tint === null ? null : cssColourOf(seen.tint),
    isPulsing: seen.pulse > 0 && !isMotionReduced,
  }
}

function wordOf(rarity: string): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1)
}

function cssColourOf([r, g, b]: Rgb): string {
  return `rgb(${channelOf(r)} ${channelOf(g)} ${channelOf(b)})`
}

function channelOf(share: number): number {
  return Math.round(Math.min(Math.max(share, 0), 1) * CHANNEL_MAX)
}
