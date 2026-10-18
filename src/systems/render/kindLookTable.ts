/**
 * The material look table the terrain shader reads (ticket 450; TD shape 6226270701 items 3 and 5,
 * Scalers' conditions on #450): one `vec4` per roster slot and one per rarity lead, written as
 * uniforms when the roster or what the player has seen changes, never per frame. A tile carries
 * only its kind slot; everything it draws comes from here, so a reveal rebuilds no chunk.
 *
 * A slot's entry is (silhouette code, pattern code, colour as 0xRRGGBB, rarity lead + 8 for a hero
 * sprite). A slot that binds no species, or one the player has not seen (Horizontal Scaler's
 * condition a), stays all zeros, which the shader draws as today's family look with no rarity
 * tint or frame. Rarity changes only the tint, frame and glow (entry per lead 1 to 4: tint as
 * 0xRRGGBB, glow, frame width in tiles, pulse share of the glow); common draws none. Look only:
 * no price, gate or income reads it.
 */
import type { Rgb } from './colour'
import { KIND_LOOKS, patternCodeOf, silhouetteCodeOf, type KindLookCatalogue } from './kindLooks'

/**
 * Roster slots the table holds: `rosterMaxKinds`, 17 since ticket 453 (GD ruling on #450, item 4:
 * 21 of the 24 vectors; a raise needs its own budget ruling). A slot past it draws the family look.
 */
export const KIND_LOOK_SLOTS = 17
/** Rarity leads 1 to 4 (uncommon to mythic); common, lead 0, draws no tint, frame or glow. */
export const RARITY_LOOK_LEADS = 4
/** Added to a slot's rarity lead when the species is drawn from the act's hero atlas (#451). */
export const HERO_LOOK_FLAG = 8
export const LOOK_VECTOR = 4

/** How one roster slot's species looks: kernel catalogue ids, its hue slot's colour, its rarity. */
export interface KindLook {
  /** The species, the key its sighting is asked by. */
  speciesId: string
  silhouette: string
  pattern: string
  colour: Rgb
  /** Its rarity's tier offset over its band, 0 common to 4 mythic. */
  rarityLead: number
  isHero: boolean
}

/** One rarity lead's tint, frame and glow. */
export interface RarityLook {
  tint: Rgb
  /** Width of the frame round each grain, in tiles. */
  frame: number
  glow: number
  /** The share of the glow that pulses; still with reduce motion. */
  pulse: number
}

export interface KindLookTable {
  /** `KIND_LOOK_SLOTS` vec4s, slot 1 first. */
  kinds: Float32Array
  /** `RARITY_LOOK_LEADS` vec4s, lead 1 first. */
  rarity: Float32Array
  /** How many slots draw a species. */
  revealedSlots: number
}

const CHANNEL_MAX = 255
const BYTE = 256

export function emptyKindLookTable(): KindLookTable {
  return {
    kinds: new Float32Array(KIND_LOOK_SLOTS * LOOK_VECTOR),
    rarity: new Float32Array(RARITY_LOOK_LEADS * LOOK_VECTOR),
    revealedSlots: 0,
  }
}

/**
 * `looks` by roster index (slot 1 first), null where a slot binds no species; `isRevealed` says
 * whether the player may see a species' look yet.
 */
export function kindLookTableOf(
  looks: readonly (KindLook | null)[],
  rarityLooks: readonly RarityLook[],
  isRevealed: (look: KindLook) => boolean,
  catalogue: KindLookCatalogue = KIND_LOOKS,
): KindLookTable {
  const table = emptyKindLookTable()
  looks.slice(0, KIND_LOOK_SLOTS).forEach((look, at) => {
    if (look === null || !isRevealed(look)) return
    table.kinds.set(kindEntryOf(look, catalogue), at * LOOK_VECTOR)
    table.revealedSlots++
  })
  rarityLooks.slice(0, RARITY_LOOK_LEADS).forEach((look, at) => {
    table.rarity.set(rarityEntryOf(look), at * LOOK_VECTOR)
  })
  return table
}

/** One slot's vec4; throws on a look the shader cannot draw. */
export function kindEntryOf(look: KindLook, catalogue: KindLookCatalogue = KIND_LOOKS): number[] {
  if (!isRarityLead(look.rarityLead)) {
    throw new Error(`${look.speciesId} has the rarity lead ${look.rarityLead}, not 0 to 4`)
  }
  return [
    silhouetteCodeOf(look.silhouette, catalogue),
    patternCodeOf(look.pattern, catalogue),
    packedRgbOf(look.colour),
    look.rarityLead + (look.isHero ? HERO_LOOK_FLAG : 0),
  ]
}

function isRarityLead(lead: number): boolean {
  return Number.isInteger(lead) && lead >= 0 && lead <= RARITY_LOOK_LEADS
}

function rarityEntryOf(look: RarityLook): number[] {
  return [packedRgbOf(look.tint), look.glow, look.frame, look.pulse]
}

/** 0xRRGGBB as a whole number, exact in a float: each channel rounded to a byte. */
export function packedRgbOf([r, g, b]: Rgb): number {
  return (byteOf(r) * BYTE + byteOf(g)) * BYTE + byteOf(b)
}

/** The colour the shader reads back from a packed entry. */
export function rgbOfPacked(packed: number): Rgb {
  return [
    Math.floor(packed / (BYTE * BYTE)) / CHANNEL_MAX,
    (Math.floor(packed / BYTE) % BYTE) / CHANNEL_MAX,
    (packed % BYTE) / CHANNEL_MAX,
  ]
}

function byteOf(channel: number): number {
  return Math.round(Math.min(1, Math.max(0, channel)) * CHANNEL_MAX)
}
