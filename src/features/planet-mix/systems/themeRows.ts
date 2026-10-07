/**
 * The planet mix's data (#141 "Design" and "Numbers"), read once from the slice's two files and
 * refused whole when broken, so a bad row fails at load with every problem listed.
 *
 * - `oreThemes.json` (Planet & Narrative): each family's `gateClass` (#141 is its single source,
 *   #142 reads it), the acts with their two commons `[even t, odd t]`, rare and signature, the
 *   endless act cycle, the planets the mix and the band-3 swap start on, the accent rules, the story
 *   planets and the lava radius. P1 (`foothold.base`) keeps the legacy family stream, so its act
 *   names no families.
 * - `planet-mix.economy.json` (Systems): the signature carve-out per band in basis points and its
 *   ×2 boost on story planets and near lava. The per-band caps are #140's, read from the `ores` index.
 *
 * Every family named here must be a family of the `ores` catalogue, and every catalogue family
 * needs a `gateClass` (#142 "Family gate classes").
 */
import { oreFamilies } from '../../ores'
import economyFile from '../planet-mix.economy.json'
import themesFile from '../oreThemes.json'

export interface OreAct {
  /** The planet's `oreThemeId`. */
  id: string
  firstPlanet: number
  lastPlanet: number
  /** `[family of even tiers, family of odd tiers]`; null on the legacy act. */
  commons: readonly [string, string] | null
  rare: string | null
  signature: string | null
}

export interface ThemeRows {
  gateClassByFamily: Readonly<Record<string, string>>
  /** The campaign acts in planet order; the last ends the planet before `endlessFromPlanet`. */
  acts: readonly OreAct[]
  endlessFromPlanet: number
  /** Act ids, repeated by `(p - endlessFromPlanet) mod length`. */
  endlessCycle: readonly string[]
  mixFromPlanet: number
  swapFromPlanet: number
  swapChanceBp: number
  accentExcludes: readonly string[]
  accentSignatureWeight: number
  storyPlanets: readonly number[]
  lavaRadiusTiles: number
  /** Basis points of bands 1 to 5 the signature takes; 0 outside bands 4 and 5. */
  signatureShareBpByBand: readonly number[]
  signatureBoost: number
}

type Raw = Record<string, unknown>

const BASIS_POINTS = 10000
const BANDS = ['1', '2', '3', '4', '5']
const SIGNATURE_BANDS = ['4', '5']

export const THEME_ROWS: ThemeRows = loadThemeRows(themesFile, economyFile)

/** Why the two files are not #141's data; empty when they are. */
export function themeRowProblems(themes: unknown, economy: unknown): string[] {
  const raw = themes as Raw
  const families = oreFamilies().map((family) => family.id)
  return [
    ...gateClassProblems(raw.gateClassByFamily, families),
    ...actListProblems(raw.acts, families),
    ...endlessProblems(raw.endless, raw.acts),
    ...wholeProblems(raw, ['mixFromPlanet', 'swapFromPlanet', 'lavaRadiusTiles'], 1),
    ...wholeProblems(raw, ['accentSignatureWeight'], 1),
    ...basisPointProblems(raw.swapChanceBp, 'swapChanceBp'),
    ...familyListProblems(raw.accentExcludes, 'accentExcludes', families),
    ...planetListProblems(raw.storyPlanets),
    ...mixEconomyProblems(((economy as Raw).mix ?? {}) as Raw),
  ]
}

function loadThemeRows(themes: typeof themesFile, economy: typeof economyFile): ThemeRows {
  const problems = themeRowProblems(themes, economy)
  if (problems.length > 0)
    throw new Error(`The planet-mix slice data is refused:\n${problems.join('\n')}`)
  return {
    gateClassByFamily: themes.gateClassByFamily,
    acts: themes.acts as readonly OreAct[],
    endlessFromPlanet: themes.endless.fromPlanet,
    endlessCycle: themes.endless.cycle,
    mixFromPlanet: themes.mixFromPlanet,
    swapFromPlanet: themes.swapFromPlanet,
    swapChanceBp: themes.swapChanceBp,
    accentExcludes: themes.accentExcludes,
    accentSignatureWeight: themes.accentSignatureWeight,
    storyPlanets: themes.storyPlanets,
    lavaRadiusTiles: themes.lavaRadiusTiles,
    signatureShareBpByBand: signatureRowOf(economy.mix.signatureShareBpByBand),
    signatureBoost: economy.mix.signatureBoost,
  }
}

function signatureRowOf(shares: Readonly<Record<string, number>>): number[] {
  return BANDS.map((band) => shares[band] ?? 0)
}

function gateClassProblems(gateClasses: unknown, families: readonly string[]): string[] {
  const named = Object.keys((gateClasses ?? {}) as Raw)
  return [
    ...families
      .filter((family) => !named.includes(family))
      .map((family) => `family "${family}" needs a gateClass`),
    ...named
      .filter((family) => !families.includes(family))
      .map((family) => `gateClassByFamily names "${family}", which the ores catalogue lacks`),
    ...named
      .filter((family) => !isName((gateClasses as Raw)[family]))
      .map((family) => `gateClassByFamily.${family} must name a class`),
  ]
}

function actListProblems(acts: unknown, families: readonly string[]): string[] {
  if (!Array.isArray(acts) || acts.length === 0) return ['acts must be a list']
  const rows = acts as Raw[]
  return [
    ...rows.flatMap((act, at) => actRowProblems(act, at, families)),
    ...rows.flatMap((act, at) => actRangeProblems(act, firstPlanetAfter(rows[at - 1]))),
  ]
}

function actRowProblems(act: Raw, at: number, families: readonly string[]): string[] {
  const where = `acts[${at}]`
  if (act.commons === null) return isName(act.id) ? [] : [`${where}.id must name the act`]
  return [
    ...(isName(act.id) ? [] : [`${where}.id must name the act`]),
    ...familyListProblems(act.commons, `${where}.commons`, families),
    ...(Array.isArray(act.commons) && act.commons.length === 2
      ? []
      : [`${where}.commons must name two families`]),
    ...familyListProblems([act.rare, act.signature], `${where} rare and signature`, families),
  ]
}

/** Acts run back to back from planet 1: each starts the planet after the last one ends. */
function actRangeProblems(act: Raw, expectedFirst: number): string[] {
  const isRange = act.firstPlanet === expectedFirst && isWhole(act.lastPlanet, expectedFirst)
  return isRange ? [] : [`act "${String(act.id)}" must run from planet ${expectedFirst}`]
}

function firstPlanetAfter(previous: Raw | undefined): number {
  return previous === undefined ? 1 : (previous.lastPlanet as number) + 1
}

function endlessProblems(endless: unknown, acts: unknown): string[] {
  const rows = (Array.isArray(acts) ? acts : []) as Raw[]
  const { fromPlanet, cycle } = (endless ?? {}) as Raw
  const actIds = rows.map((act) => act.id)
  const isAfterCampaign = fromPlanet === (rows[rows.length - 1]?.lastPlanet as number) + 1
  const isCycle =
    Array.isArray(cycle) && cycle.length > 1 && cycle.every((id) => actIds.includes(id))
  return [
    ...(isAfterCampaign ? [] : ['endless.fromPlanet must follow the last act']),
    ...(isCycle ? [] : ['endless.cycle must list two or more act ids']),
  ]
}

function familyListProblems(list: unknown, where: string, families: readonly string[]): string[] {
  if (!Array.isArray(list)) return [`${where} must list families`]
  return list
    .filter((family) => !families.includes(family as string))
    .map((family) => `${where} names "${String(family)}", which the ores catalogue lacks`)
}

function planetListProblems(planets: unknown): string[] {
  const isList = Array.isArray(planets) && planets.every((planet) => isWhole(planet, 1))
  return isList ? [] : ['storyPlanets must list planet indices']
}

function mixEconomyProblems(mix: Raw): string[] {
  const shares = (mix.signatureShareBpByBand ?? {}) as Raw
  const isBands = Object.keys(shares).sort().join() === SIGNATURE_BANDS.join()
  return [
    ...(isBands ? [] : ['mix.signatureShareBpByBand must give bands 4 and 5 a share']),
    ...SIGNATURE_BANDS.flatMap((band) =>
      basisPointProblems(shares[band], `mix.signatureShareBpByBand.${band}`),
    ),
    ...wholeProblems(mix, ['signatureBoost'], 1),
  ]
}

function wholeProblems(raw: Raw, keys: readonly string[], from: number): string[] {
  return keys
    .filter((key) => !isWhole(raw[key], from))
    .map((key) => `${key} must be whole, from ${from}`)
}

function basisPointProblems(value: unknown, where: string): string[] {
  return isWhole(value, 0) && value <= BASIS_POINTS ? [] : [`${where} must be in basis points`]
}

function isName(value: unknown): boolean {
  return typeof value === 'string' && value !== ''
}

function isWhole(value: unknown, from: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= from
}
