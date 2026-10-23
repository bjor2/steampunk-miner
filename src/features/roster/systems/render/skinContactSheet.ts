/**
 * The skin contact sheet of a planet (ticket 746 under #647, done-when 1 "a distinct sprite and hue
 * for every species, readable at 360 px"): every kind slot of a fresh planet as the terrain draws it
 * on frame 1, before any drilling, from the same look table the shader reads (`kindLookTable.ts`):
 * the catalogue silhouette and pattern, the hue slot colour, and the resident act atlas's cell for a
 * hero. Nothing has been met on frame 1, so no row carries a rarity (GD ruling on #698, option 2).
 * Look only: no price, gate or income reads it.
 */
import { heroCellsOf } from '../../../../systems/render/heroAtlas'
import { kindEntryOf, type KindLook } from '../../../../systems/render/kindLookTable'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import { MATERIALS } from '../../../materials'
import { gemSaleTiersOf, type KindSlot } from '../../../ores'
import { planetRosterOf } from '../planetRoster'
import { gemSaleTierOfKind } from '../rosterGems'
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
  /** The cell of the act's atlas the hero draws from; null draws the shader look. */
  heroCell: number | null
  /** The gem's rank k on its planet, cheapest first (ticket 741); null for a non-gem. */
  gemRank: number | null
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

export function planetContactSheetOf(params: PlanetParams): PlanetContactSheet {
  const roster = planetRosterOf(params)
  const looks = planetKindLooksOf(params)
  const heroCells = heroCellsOf(heroAtlasOfPlanet(params.planetIndex)?.cells ?? [])
  const gemTiers = gemSaleTiersOf(params.planetIndex, params.oreRulesVersion)
  return {
    planetIndex: params.planetIndex,
    rows: looks.flatMap((look, at) =>
      look === null
        ? []
        : [contactSheetRowOf(look, at + 1, heroCells, gemRankOf(params, roster[at], gemTiers))],
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
  gemRank: number | null,
): ContactSheetRow {
  const heroCell = look.isHero ? (heroCells.get(look.speciesId) ?? null) : null
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
    gemRank,
  }
}

function gemRankOf(
  params: PlanetParams,
  kind: KindSlot,
  gemTiers: readonly number[],
): number | null {
  const tier = gemSaleTierOfKind(params, kind)
  return tier === null ? null : gemTiers.indexOf(tier)
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
