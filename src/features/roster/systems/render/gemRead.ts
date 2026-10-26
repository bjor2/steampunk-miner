/**
 * How a gem reads on frame 1 (ticket 785 under #647; the GD addendum on #746): "a faceted outline
 * and at least one highlight, at 360 px and 1280+", and Systems' price-order score, "k plus the
 * share of bright or saturated pixels in the gem's cell", which never falls as the price rises and
 * never puts a gem under its planet's top non-gem ore. The pixels are measured by the art pipeline
 * over the committed cells (`docs/art/ore-heroes/hero_reads.py`, written into `hero-reads.json`
 * with the SHA-256 of each cell), so the rule here is pure arithmetic over those measures and the
 * contact sheet. A row with no hero cell has no cell pixels, so its share is 0. Look only: no
 * price, gate or income reads it.
 */
import type { ContactSheetRow, PlanetContactSheet } from './skinContactSheet'

/** One cell's measures at one screen, as `hero_reads.py` writes them. */
export interface CellScreenRead {
  highlightCount: number
  facetEdgeShare: number
  outlineContrast: number
  brightOrSaturatedShare: number
}

/** One hero cell's measures at the gem-read screens, keyed `360x640` and `1280x800`. */
export interface HeroCellRead {
  speciesId: string
  cellSha256: string
  screens: Record<string, CellScreenRead>
}

export interface HeroReads {
  screens: Record<string, number>
  heroes: HeroCellRead[]
}

/** The two screens of the gem-read test (ticket 744): a phone and a desktop at the default zoom. */
export const GEM_READ_SCREENS = ['360x640', '1280x800'] as const
/**
 * What "a faceted outline" is in the measures: at least this share of the body's pixels sit on a
 * luma edge (a facet border or the outline), and the body stands off its rock by this contrast.
 * Set from P2's three gems of ticket 744, which the GD accepted as reading as gems.
 */
export const FACETED_EDGE_SHARE_FLOOR = 0.15
export const OUTLINE_CONTRAST_FLOOR = 1.2
export const HIGHLIGHTS_FLOOR = 1

/** The read of a species' cell, or null when the pipeline measured none. */
export function heroReadOf(reads: HeroReads, speciesId: string): HeroCellRead | null {
  return reads.heroes.find((hero) => hero.speciesId === speciesId) ?? null
}

/** Why a cell fails to read as a gem on a screen; empty when it reads. */
export function gemReadProblemsOf(read: HeroCellRead): string[] {
  return gemReadProblemsAt(read, GEM_READ_SCREENS)
}

/** The same read on any screens the pipeline measured: the gem-cut library adds 24 px (ticket 889). */
export function gemReadProblemsAt(read: HeroCellRead, screens: readonly string[]): string[] {
  return screens.flatMap((screen) => screenProblemsOf(read, screen))
}

function screenProblemsOf(read: HeroCellRead, screen: string): string[] {
  const measures = read.screens[screen]
  if (measures === undefined) return [`${read.speciesId} has no read at ${screen}`]
  return [
    ...(measures.highlightCount >= HIGHLIGHTS_FLOOR
      ? []
      : [`${read.speciesId} shows no highlight at ${screen}`]),
    ...(measures.facetEdgeShare >= FACETED_EDGE_SHARE_FLOOR
      ? []
      : [
          `${read.speciesId} has ${measures.facetEdgeShare} of its body on facet edges at ${screen}`,
        ]),
    ...(measures.outlineContrast >= OUTLINE_CONTRAST_FLOOR
      ? []
      : [`${read.speciesId} stands only ${measures.outlineContrast} off its rock at ${screen}`]),
  ]
}

/**
 * Systems' showiness score on a screen: the gem's rank k plus its cell's bright-or-saturated share.
 * A non-gem has no rank, so only its share counts; a row with no cell has no cell pixels.
 */
export function showinessOf(row: ContactSheetRow, reads: HeroReads, screen: string): number {
  return (row.gemRank ?? 0) + brightOrSaturatedShareOf(row, reads, screen)
}

function brightOrSaturatedShareOf(row: ContactSheetRow, reads: HeroReads, screen: string): number {
  if (row.heroCell === null) return 0
  return heroReadOf(reads, row.speciesId)?.screens[screen]?.brightOrSaturatedShare ?? 0
}

/**
 * Every way a planet's gems break price order on a screen: a cheaper gem scoring above a pricier
 * one (ties allowed), or any gem scoring under the planet's top non-gem ore. Empty when the order
 * holds.
 */
export function priceOrderProblemsOf(
  sheet: PlanetContactSheet,
  reads: HeroReads,
  screen: string,
): string[] {
  const gems = gemsBySaleTierOf(sheet)
  const scores = gems.map((row) => showinessOf(row, reads, screen))
  const topNonGem = topNonGemScoreOf(sheet, reads, screen)
  return [
    ...scores.flatMap((score, at) =>
      at > 0 && score < (scores[at - 1] ?? 0)
        ? [
            `P${sheet.planetIndex} ${gems[at]?.speciesId} scores ${score} under the cheaper ${gems[at - 1]?.speciesId} at ${screen}`,
          ]
        : [],
    ),
    ...scores.flatMap((score, at) =>
      score < topNonGem
        ? [
            `P${sheet.planetIndex} ${gems[at]?.speciesId} scores ${score} under the top non-gem ${topNonGem} at ${screen}`,
          ]
        : [],
    ),
  ]
}

function gemsBySaleTierOf(sheet: PlanetContactSheet): ContactSheetRow[] {
  return sheet.rows
    .filter((row) => row.gemRank !== null)
    .sort((a, b) => (a.gemSaleTier ?? 0) - (b.gemSaleTier ?? 0))
}

/** The score of the planet's showiest non-gem: what every gem must reach. */
function topNonGemScoreOf(sheet: PlanetContactSheet, reads: HeroReads, screen: string): number {
  return Math.max(
    0,
    ...sheet.rows
      .filter((row) => row.gemRank === null)
      .map((row) => showinessOf(row, reads, screen)),
  )
}
