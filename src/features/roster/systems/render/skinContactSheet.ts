/**
 * The skin contact sheet of a planet (ticket 746 under #647, done-when 1 "a distinct sprite and hue
 * for every species, readable at 360 px"): every kind slot of a fresh planet as the terrain draws it
 * on frame 1, before any drilling, from the same look table the shader reads (`kindLookTable.ts`):
 * the catalogue silhouette and pattern, the hue slot colour, and the resident act atlas's cell for a
 * hero. Nothing has been met on frame 1, so no row carries a rarity (GD ruling on #698, option 2).
 * Look only: no price, gate or income reads it.
 */
import { heroCellsOf, type HeroAtlasCells } from '../../../../systems/render/heroAtlas'
import { kindEntryOf, spriteIdOf, type KindLook } from '../../../../systems/render/kindLookTable'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import { MATERIALS } from '../../../materials'
import { gemSaleTiersOf, type KindSlot } from '../../../ores'
import { planetRosterOf } from '../planetRoster'
import { gemRankAmong, gemSaleTierOfKind } from '../rosterGems'
import { heroAtlasOfPlanet, planetKindLooksOf } from './kindLookProvider'

/** One kind slot of the sheet: what it draws, and which gem of the planet it is. */
export interface ContactSheetRow {
  slot: number
  speciesId: string
  name: string
  rarity: string
  silhouette: string
  silhouetteCode: number
  pattern: string
  patternCode: number
  /** The hue slot colour as the shader reads it back, `#rrggbb`. */
  colour: string
  /**
   * The act-wide cell of the act's atlas the hero draws from, 16 a page (ticket 852); null draws
   * the shader look.
   */
  heroCell: number | null
  /** The gem's rank k on its planet, cheapest first (ticket 741); null for a non-gem. */
  gemRank: number | null
  /** The tier the gem sells at, `t_top + Δ_k` (ticket 741); null for a non-gem. */
  gemSaleTier: number | null
  /** The gem-cut library cut a generated gem draws its cell from (ticket 889); absent otherwise. */
  gemCut?: string
}

/** Which gem of its planet a kind is: its rank k and the tier it sells at. */
interface GemPlace {
  rank: number
  saleTier: number
}

/** A slot that binds no species: the shader would draw the family fallback on frame 1. */
export interface UnskinnedSlot {
  slot: number
  slotId: string
}

export interface PlanetContactSheet {
  planetIndex: number
  rows: ContactSheetRow[]
  unskinned: UnskinnedSlot[]
}

const HEX_DIGITS = 6
const HEX_RADIX = 16
/** The #450 rule: two kinds read apart when they differ in at least two of these three. */
const LOOK_CHANNELS = ['silhouetteCode', 'patternCode', 'colour'] as const
const MIN_CHANNELS_APART = 2

/** `atlas` is the planet's act's unless a check packs another (ticket 852's synthetic overflow). */
export function planetContactSheetOf(
  params: PlanetParams,
  atlas: HeroAtlasCells | null = heroAtlasOfPlanet(params.planetIndex),
): PlanetContactSheet {
  const roster = planetRosterOf(params)
  const looks = planetKindLooksOf(params)
  const heroCells = heroCellsOf(atlas?.pages ?? [])
  const gemTiers = gemSaleTiersOf(params.planetIndex, params.oreRulesVersion)
  return {
    planetIndex: params.planetIndex,
    rows: looks.flatMap((look, at) =>
      look === null
        ? []
        : [contactSheetRowOf(look, at + 1, heroCells, gemPlaceOf(params, roster[at], gemTiers))],
    ),
    unskinned: roster.flatMap((kind, at) =>
      looks[at] === null ? [{ slot: at + 1, slotId: kind.slotId }] : [],
    ),
  }
}

function contactSheetRowOf(
  look: KindLook,
  slot: number,
  heroCells: ReadonlyMap<string, number>,
  gem: GemPlace | null,
): ContactSheetRow {
  const heroCell = look.isHero ? (heroCells.get(spriteIdOf(look)) ?? null) : null
  const [silhouetteCode, patternCode, packedColour] = kindEntryOf(look, heroCell)
  const species = MATERIALS.materials.find((row) => row.id === look.speciesId)
  return {
    slot,
    speciesId: look.speciesId,
    name: species?.name ?? look.speciesId,
    rarity: species?.rarity ?? '',
    silhouette: look.silhouette,
    silhouetteCode,
    pattern: look.pattern,
    patternCode,
    colour: hexOfPacked(packedColour),
    heroCell,
    gemRank: gem?.rank ?? null,
    gemSaleTier: gem?.saleTier ?? null,
    ...(look.spriteId === undefined ? {} : { gemCut: look.spriteId }),
  }
}

function gemPlaceOf(
  params: PlanetParams,
  kind: KindSlot,
  gemTiers: readonly number[],
): GemPlace | null {
  const saleTier = gemSaleTierOfKind(params, kind)
  return saleTier === null ? null : { rank: gemRankAmong(gemTiers, saleTier), saleTier }
}

function hexOfPacked(packed: number): string {
  return `#${packed.toString(HEX_RADIX).padStart(HEX_DIGITS, '0')}`
}

/**
 * Every pair of the sheet a player could not tell apart on the ground, as `a vs b` lines: two rows
 * sharing more than one of silhouette, pattern and colour (the Scalers' rule on #450, over every
 * pair of the planet, not one family), or two heroes drawing one atlas cell. The shader look is
 * judged even for a hero with a cell, because a device the probe refuses the atlas draws it.
 */
export function unreadablePairsOf(sheet: PlanetContactSheet): string[] {
  return sheet.rows.flatMap((row, at) =>
    sheet.rows
      .slice(at + 1)
      .filter((other) => !isReadApart(row, other))
      .map((other) => `P${sheet.planetIndex} ${row.speciesId} vs ${other.speciesId}`),
  )
}

function isReadApart(a: ContactSheetRow, b: ContactSheetRow): boolean {
  return channelsApartOf(a, b) >= MIN_CHANNELS_APART && !isSameHeroCell(a, b)
}

function channelsApartOf(a: ContactSheetRow, b: ContactSheetRow): number {
  return LOOK_CHANNELS.filter((channel) => a[channel] !== b[channel]).length
}

function isSameHeroCell(a: ContactSheetRow, b: ContactSheetRow): boolean {
  return a.heroCell !== null && a.heroCell === b.heroCell
}
