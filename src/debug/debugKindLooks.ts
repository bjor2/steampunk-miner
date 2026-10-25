/**
 * The debug API's read and switch of the ground's material looks (ticket 450): the look table the
 * terrain material was last given, as the shader reads it, and a presentation switch that shows
 * every kind as if the player had met it, for eye checks and the #526 frame A/B (a fresh save
 * draws every skin but no rarity, ticket 698). State, never pixels; no command, no log line, not in the digest. It also reads the
 * per-act hero atlas (ticket 451): whether the probe gave it the 16th unit, the act resident, its
 * pages and cells (ticket 852) and how many binds there have been, so a spec sees a swap happen only at a change of act,
 * and the first-contact flourishes started (ticket 698), so a spec sees one per species met, and
 * each gem's rank glint (ticket 786) as the shader unpacks it.
 */
import { heroAtlasPresence } from '../scene/heroAtlasPresence'
import { kindLookPresence } from '../scene/kindLookPresence'
import { speciesRevealPresence } from '../scene/speciesRevealPresence'
import { gemGlintOfCode, type GemGlint } from '../systems/render/gemGlint'
import {
  gemGlintCodeOfEntry,
  heroCellOfEntry,
  KIND_LOOK_SLOTS,
  LOOK_VECTOR,
  rarityLeadOfEntry,
  rgbOfPacked,
} from '../systems/render/kindLookTable'
import type { Rgb } from '../systems/render/colour'
import type { HeroAtlasUnit } from '../systems/render/gpuTier'
import type { DebugResult } from './debugScreens'

/** One roster slot as the shader draws it; codes 0 draw the family look, lead 0 no rarity. */
export interface DrawnKindLook {
  slot: number
  silhouetteCode: number
  patternCode: number
  colour: Rgb
  rarityLead: number
  /** The resident hero atlas's cell it draws from (ticket 451); null draws the shader look. */
  heroCell: number | null
  /** A gem's rank glint (ticket 786): its step, pips and finish; null for a species no gem. */
  gemGlint: GemGlint | null
}

/** The resident hero atlas as the debug read hands it out: plain JSON, cells as pairs. */
export interface DrawnHeroAtlasRead {
  unit: HeroAtlasUnit
  residentId: string | null
  /** Its bound layers, one per page (ticket 852). */
  pages: number
  /** Each species of the bound pages with its act-wide cell, cell 0 first. */
  heroCells: [string, number][]
  binds: number
  refusedId: string | null
}

export interface DrawnKindLooks {
  isEveryKindShown: boolean
  /** Slots drawing a species, slot 1 first. */
  shown: DrawnKindLook[]
  heroAtlas: DrawnHeroAtlasRead
  /** First-contact flourishes since the page loaded (ticket 698): one per species met. */
  reveals: typeof speciesRevealPresence
}

export function readDrawnKindLooks(): DebugResult<{ looks: DrawnKindLooks }> {
  const { table, isEveryKindShown } = kindLookPresence
  const slots = Array.from({ length: KIND_LOOK_SLOTS }, (_, at) => drawnLookOf(table.kinds, at))
  return {
    ok: true,
    looks: {
      isEveryKindShown,
      shown: slots.filter((look) => look.silhouetteCode > 0),
      heroAtlas: { ...heroAtlasPresence, heroCells: [...heroAtlasPresence.heroCells] },
      reveals: { ...speciesRevealPresence },
    },
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
    gemGlint: gemGlintOfCode(gemGlintCodeOfEntry(rarity)),
  }
}
