/**
 * The debug API's read and switch of the ground's material looks (ticket 450): the look table the
 * terrain material was last given, as the shader reads it, and a presentation switch that shows
 * every kind as if the player had met it, for eye checks and the #526 frame A/B (a fresh save
 * shows none). State, never pixels; no command, no log line, not in the digest.
 */
import { kindLookPresence } from '../scene/kindLookPresence'
import {
  heroCellOfEntry,
  KIND_LOOK_SLOTS,
  LOOK_VECTOR,
  rarityLeadOfEntry,
  rgbOfPacked,
} from '../systems/render/kindLookTable'
import type { Rgb } from '../systems/render/colour'
import type { DebugResult } from './debugScreens'

/** One roster slot as the shader draws it; codes 0 draw the family look. */
export interface DrawnKindLook {
  slot: number
  silhouetteCode: number
  patternCode: number
  colour: Rgb
  rarityLead: number
  /** The resident hero atlas's cell it draws from (ticket 451); null draws the shader look. */
  heroCell: number | null
}

export interface DrawnKindLooks {
  isEveryKindShown: boolean
  /** Slots drawing a species, slot 1 first. */
  shown: DrawnKindLook[]
}

export function readDrawnKindLooks(): DebugResult<{ looks: DrawnKindLooks }> {
  const { table, isEveryKindShown } = kindLookPresence
  const slots = Array.from({ length: KIND_LOOK_SLOTS }, (_, at) => drawnLookOf(table.kinds, at))
  return {
    ok: true,
    looks: { isEveryKindShown, shown: slots.filter((look) => look.silhouetteCode > 0) },
  }
}

export function showEveryKindLook(): DebugResult {
  kindLookPresence.isEveryKindShown = true
  return { ok: true }
}

export function showSeenKindLooksOnly(): DebugResult {
  kindLookPresence.isEveryKindShown = false
  return { ok: true }
}

function drawnLookOf(kinds: Float32Array, at: number): DrawnKindLook {
  const [silhouetteCode, patternCode, colour, rarity] = kinds.subarray(
    at * LOOK_VECTOR,
    (at + 1) * LOOK_VECTOR,
  )
  return {
    slot: at + 1,
    silhouetteCode,
    patternCode,
    colour: rgbOfPacked(colour),
    rarityLead: rarityLeadOfEntry(rarity),
    heroCell: heroCellOfEntry(rarity),
  }
}
