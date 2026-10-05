/**
 * The art direction data (#13): band palettes per planet palette id, the ore families' silhouette
 * and hue, and the knobs of the one tier formula. Read once from `artDirection.json` and refused
 * whole if broken, so a bad edit fails at load with every problem listed.
 */
import artFile from './artDirection.json'
import { isHexColour, rgbOfHex, type Rgb } from './colour'

export interface BandPalette {
  /** Band 1's ground; bands 2 to 5 step toward `deep`. */
  surface: Rgb
  deep: Rgb
  core: Rgb
  /** The dock pad (#8), lit like the platform. */
  pad: Rgb
  /** The background above the surface, fading to `underground` with depth. */
  sky: Rgb
  underground: Rgb
}

/** Family sets the shape (#13): metals are angular flecks, crystals faceted shards. */
export type OreSilhouette = 'flecks' | 'shards'

export interface OreFamilyLook {
  silhouette: OreSilhouette
  hue: Rgb
}

/** The tier formula's knobs: rank `t / (t + halfRankTier)` drives luma, glow and sparkles. */
export interface OreRamp {
  halfRankTier: number
  lumaMin: number
  lumaMax: number
  glowMax: number
  sparklesMax: number
}

export interface ArtDirection {
  palettes: Readonly<Record<string, BandPalette>>
  oreFamilies: { metal: OreFamilyLook; crystal: OreFamilyLook }
  oreRamp: OreRamp
  /** How far a tile's lightness may drift from its band colour, for the subtle noise texture. */
  tileShadeSpread: number
}

const PALETTE_COLOURS = ['surface', 'deep', 'core', 'pad', 'sky', 'underground'] as const
const SILHOUETTES: readonly string[] = ['flecks', 'shards']
const RAMP_KNOBS = ['halfRankTier', 'lumaMin', 'lumaMax', 'glowMax', 'sparklesMax'] as const

export const ART_DIRECTION: ArtDirection = loadArtDirection(artFile)

export function artDirectionProblems(raw: unknown): string[] {
  const file = raw as Partial<Record<string, Record<string, Record<string, unknown>>>>
  return [
    ...Object.entries(file.palettes ?? {}).flatMap(([id, palette]) => paletteProblems(id, palette)),
    ...['metal', 'crystal'].flatMap((family) => familyProblems(family, file.oreFamilies?.[family])),
    ...RAMP_KNOBS.filter((knob) => !isPositive(file.oreRamp?.[knob])).map(
      (knob) => `oreRamp.${knob} must be a number > 0`,
    ),
  ]
}

function loadArtDirection(raw: typeof artFile): ArtDirection {
  const problems = artDirectionProblems(raw)
  if (problems.length > 0) throw new Error(`artDirection.json is refused:\n${problems.join('\n')}`)
  return {
    palettes: Object.fromEntries(
      Object.entries(raw.palettes).map(([id, palette]) => [id, paletteOf(palette)]),
    ),
    oreFamilies: {
      metal: familyOf(raw.oreFamilies.metal),
      crystal: familyOf(raw.oreFamilies.crystal),
    },
    oreRamp: raw.oreRamp,
    tileShadeSpread: raw.tileShadeSpread,
  }
}

function paletteProblems(id: string, palette: Record<string, unknown>): string[] {
  return PALETTE_COLOURS.filter((name) => !isHexColour(palette[name])).map(
    (name) => `palettes.${id}.${name} must be a #rrggbb colour`,
  )
}

function familyProblems(family: string, look: Record<string, unknown> | undefined): string[] {
  const problems: string[] = []
  if (!SILHOUETTES.includes(String(look?.silhouette))) {
    problems.push(`oreFamilies.${family}.silhouette must be one of ${SILHOUETTES.join(', ')}`)
  }
  if (!isHexColour(look?.hue)) problems.push(`oreFamilies.${family}.hue must be a #rrggbb colour`)
  return problems
}

function isPositive(value: unknown): boolean {
  return typeof value === 'number' && value > 0
}

function paletteOf(palette: Record<(typeof PALETTE_COLOURS)[number], string>): BandPalette {
  return {
    surface: rgbOfHex(palette.surface),
    deep: rgbOfHex(palette.deep),
    core: rgbOfHex(palette.core),
    pad: rgbOfHex(palette.pad),
    sky: rgbOfHex(palette.sky),
    underground: rgbOfHex(palette.underground),
  }
}

function familyOf(look: { silhouette: string; hue: string }): OreFamilyLook {
  return { silhouette: look.silhouette as OreSilhouette, hue: rgbOfHex(look.hue) }
}
