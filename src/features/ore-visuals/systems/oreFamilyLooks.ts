/**
 * The ore look data (#151): the 12 family rows of the Game Director's table (silhouette, hue
 * band, luma band), the grade ladder's knobs, the visual echo past G5, the atlas cell rule and the
 * planet-tint caps, read once from `oreLooks.json` and refused whole when broken, so a bad row
 * fails at load with every problem listed. The row list is the ore atlas's enumeration: the bake
 * (docs/art/ores) reads the same file, so adding a family adds a row and nothing else.
 */
import looksFile from '../oreLooks.json'

/** Which of the kernel shader's two decals stands in for a family until the atlas renderer lands. */
export type ShaderSilhouette = 'flecks' | 'shards'

export interface OreEmissionHue {
  hue: number
  saturation: number
}

export interface OreFamilyLook {
  id: string
  name: string
  /** The #151 silhouette family: the shape that escalates from G1 to G5. */
  silhouette: string
  escalation: string
  shaderSilhouette: ShaderSilhouette
  /** Degrees; the planet tint may shift the hue inside it, never outside. */
  hueBand: readonly [number, number]
  saturation: number
  /** Keeps families apart in greyscale; the grade climbs within it. */
  lumaBand: readonly [number, number]
  /** Glow is always the family's own hue (#151 planet tint), white at the top. */
  emission: OreEmissionHue
  /** Exotic's G4+ dichroic shift: the second hue the facing angle mixes toward. */
  dichroicHue?: number
  /** Looks per family, each one atlas cell per grade; at most `atlas.variantsMax`. */
  variants: number
}

export interface OreAtlasRules {
  sidePx: number
  cellPx: number
  /** Baked content per cell; the rest of the cell is the gutter so mips never bleed. */
  contentPx: number
  gutterPx: number
  variantsMax: number
}

export interface OreGradeRules {
  /** Emissive strength per grade, G1 to G5, scaled by the strength within the grade. */
  glow: readonly number[]
  sparkles: readonly number[]
  /** The share of a grade's glow that band 1 of the grade keeps; band 5 reaches the full glow. */
  strengthFloor: number
  /** Particles per mining hit by grade, inside one pool of `particlePoolMax` alive at once. */
  hitParticles: readonly number[]
  particlePoolMax: number
  emissiveFromGrade: number
  /** A core held under this strength keeps its pulse visible under the bloom. */
  coreEmissionMax: number
}

export interface VisualEchoRules {
  /** `visualEcho = t < fromTier ? 0 : floor((t - fromTier) / everyTiers) + 1` (#151). */
  fromTier: number
  everyTiers: number
  ringsMax: number
  /** From the echo past the last ring, each step cycles one of these G5 effect variants. */
  effectVariants: readonly string[]
}

export interface PlanetTintRules {
  hueShiftMaxDeg: number
  chromaMax: number
  mixMax: number
  rimMax: number
}

export interface OreLightSlotRules {
  max: number
  floor: number
}

export interface OreLooks {
  /** Sorted by id, the registry order the atlas enumerates. */
  families: readonly OreFamilyLook[]
  reservedHueBands: readonly (readonly [number, number])[]
  atlas: OreAtlasRules
  grades: OreGradeRules
  visualEcho: VisualEchoRules
  planetTint: PlanetTintRules
  lightSlots: OreLightSlotRules
}

export const ORE_GRADE_COUNT = 5

const SHADER_SILHOUETTES: readonly string[] = ['flecks', 'shards']
const KEBAB_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const HUE_MAX = 360

type Raw = Record<string, unknown>

export const ORE_LOOKS: OreLooks = loadOreLooks(looksFile)

export function oreFamilyLookOf(looks: OreLooks, familyId: string): OreFamilyLook | null {
  return looks.families.find((family) => family.id === familyId) ?? null
}

/** Cells the atlas needs: every family's variants, one cell per grade. */
export function oreAtlasCellCountOf(looks: OreLooks): number {
  return looks.families.reduce((count, family) => count + family.variants * ORE_GRADE_COUNT, 0)
}

export function oreAtlasCellCapacityOf(atlas: OreAtlasRules): number {
  const perRow = Math.floor(atlas.sidePx / atlas.cellPx)
  return perRow * perRow
}

/** Why the file is not the #151 data; empty when it is. */
export function oreLookProblems(raw: unknown): string[] {
  const file = raw as Raw
  const families = Array.isArray(file.families) ? (file.families as Raw[]) : []
  return [
    ...(Array.isArray(file.families) && families.length > 0 ? [] : ['families must be a list']),
    ...families.flatMap((family, at) => familyProblems(family, at, file)),
    ...duplicateProblems(families, 'id'),
    ...duplicateProblems(families, 'silhouette'),
    ...capacityProblems(families, file.atlas as Raw | undefined),
    ...gradeProblems(file.grades as Raw | undefined),
    ...echoProblems(file.visualEcho as Raw | undefined),
  ]
}

function loadOreLooks(raw: typeof looksFile): OreLooks {
  const problems = oreLookProblems(raw)
  if (problems.length > 0) throw new Error(`oreLooks.json is refused:\n${problems.join('\n')}`)
  return {
    families: [...raw.families].sort(byId).map(familyOf),
    reservedHueBands: raw.reservedHueBands.map(([low, high]) => [low, high] as const),
    atlas: raw.atlas,
    grades: raw.grades,
    visualEcho: raw.visualEcho,
    planetTint: raw.planetTint,
    lightSlots: raw.lightSlots,
  }
}

function familyOf(row: (typeof looksFile.families)[number]): OreFamilyLook {
  const [hueLow, hueHigh] = row.hueBand
  const [lumaLow, lumaHigh] = row.lumaBand
  return {
    ...row,
    shaderSilhouette: row.shaderSilhouette as ShaderSilhouette,
    hueBand: [hueLow, hueHigh],
    lumaBand: [lumaLow, lumaHigh],
  }
}

function familyProblems(family: Raw, at: number, file: Raw): string[] {
  const where = `families[${at}]`
  const atlas = file.atlas as Raw | undefined
  return [
    ...(KEBAB_ID.test(String(family.id)) ? [] : [`${where}.id must be kebab-case`]),
    ...(typeof family.silhouette === 'string' ? [] : [`${where}.silhouette must name a shape`]),
    ...(SHADER_SILHOUETTES.includes(String(family.shaderSilhouette))
      ? []
      : [`${where}.shaderSilhouette must be one of ${SHADER_SILHOUETTES.join(', ')}`]),
    ...hueBandProblems(where, family.hueBand, file.reservedHueBands),
    ...(isUnit(family.saturation) ? [] : [`${where}.saturation must be in 0..1`]),
    ...(isRisingUnitBand(family.lumaBand) ? [] : [`${where}.lumaBand must rise within 0..1`]),
    ...emissionProblems(where, family.emission as Raw | undefined),
    ...variantProblems(where, family.variants, atlas?.variantsMax),
  ]
}

function hueBandProblems(where: string, band: unknown, reserved: unknown): string[] {
  if (!isRisingBand(band, HUE_MAX)) return [`${where}.hueBand must be two rising degrees in 0..360`]
  const bands = Array.isArray(reserved) ? (reserved as [number, number][]) : []
  return bands
    .filter((taken) => overlaps(band as [number, number], taken))
    .map((taken) => `${where}.hueBand overlaps the reserved ${taken[0]}-${taken[1]} degrees`)
}

function emissionProblems(where: string, emission: Raw | undefined): string[] {
  const isHue = typeof emission?.hue === 'number' && emission.hue >= 0 && emission.hue <= HUE_MAX
  return isHue && isUnit(emission?.saturation)
    ? []
    : [`${where}.emission must give a hue in 0..360 and a saturation in 0..1`]
}

function variantProblems(where: string, variants: unknown, variantsMax: unknown): string[] {
  const max = typeof variantsMax === 'number' ? variantsMax : 0
  const isCount = Number.isInteger(variants) && (variants as number) >= 1
  if (!isCount) return [`${where}.variants must be a whole number from 1`]
  return (variants as number) <= max ? [] : [`${where}.variants must be at most ${max}`]
}

function duplicateProblems(families: readonly Raw[], field: string): string[] {
  const values = families.map((family) => String(family[field]))
  return values
    .filter((value, at) => values.indexOf(value) !== at)
    .map((value) => `families share the ${field} "${value}"; each family needs its own`)
}

/** The build fails past the atlas (#151 budgets): more families need the per-planet atlas. */
function capacityProblems(families: readonly Raw[], atlas: Raw | undefined): string[] {
  const side = atlas?.sidePx
  const cell = atlas?.cellPx
  if (typeof side !== 'number' || typeof cell !== 'number' || cell <= 0) {
    return ['atlas.sidePx and atlas.cellPx must be numbers']
  }
  const capacity = oreAtlasCellCapacityOf({ ...(atlas as unknown as OreAtlasRules) })
  const needed = families.reduce((count, family) => count + variantCountOf(family), 0)
  if (needed <= capacity) return []
  return [
    `${families.length} families need ${needed} atlas cells, but one ${side} px atlas holds ${capacity}: a family past 12 needs the per-planet atlas follow-up of #151 section 3`,
  ]
}

function variantCountOf(family: Raw): number {
  return typeof family.variants === 'number' ? family.variants * ORE_GRADE_COUNT : 0
}

function gradeProblems(grades: Raw | undefined): string[] {
  return [
    ...['glow', 'sparkles', 'hitParticles']
      .filter((knob) => !isNonDecreasingByGrade(grades?.[knob]))
      .map((knob) => `grades.${knob} must list ${ORE_GRADE_COUNT} values that never fall`),
    ...glowLadderProblems(grades),
  ]
}

/** A grade's first tier (glow x floor) glows at least as much as the grade below at its last. */
function glowLadderProblems(grades: Raw | undefined): string[] {
  const glow = grades?.glow
  const floor = grades?.strengthFloor
  if (!isNonDecreasingByGrade(glow) || !isUnit(floor))
    return ['grades.strengthFloor must be in 0..1']
  const ladder = glow as number[]
  const dips = ladder.filter((value, at) => at > 0 && value * (floor as number) < ladder[at - 1])
  return dips.length === 0
    ? []
    : ['grades.glow x strengthFloor must not fall below the grade before']
}

function echoProblems(echo: Raw | undefined): string[] {
  const isTiers = isPositiveInteger(echo?.fromTier) && isPositiveInteger(echo?.everyTiers)
  const variants = echo?.effectVariants
  const isVariants = Array.isArray(variants) && variants.length > 0
  return [
    ...(isTiers ? [] : ['visualEcho.fromTier and everyTiers must be whole tiers from 1']),
    ...(isVariants ? [] : ['visualEcho.effectVariants must list at least one effect']),
  ]
}

function isNonDecreasingByGrade(values: unknown): boolean {
  return (
    Array.isArray(values) &&
    values.length === ORE_GRADE_COUNT &&
    values.every(
      (value, at) =>
        typeof value === 'number' && value >= 0 && (at === 0 || value >= values[at - 1]),
    )
  )
}

function isRisingBand(band: unknown, max: number): band is [number, number] {
  return (
    Array.isArray(band) &&
    band.length === 2 &&
    band.every((edge) => typeof edge === 'number' && edge >= 0 && edge <= max) &&
    band[0] < band[1]
  )
}

function isRisingUnitBand(band: unknown): boolean {
  return isRisingBand(band, 1)
}

function overlaps(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1]
}

function isUnit(value: unknown): boolean {
  return typeof value === 'number' && value >= 0 && value <= 1
}

function isPositiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 1
}

/** Code-unit order, as the kernel registries sort, so every machine enumerates the same cells. */
function byId(a: { id: string }, b: { id: string }): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}
