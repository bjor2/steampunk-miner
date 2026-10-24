/**
 * The star map carousel's art ids and layout (ticket 795, spec #647; the star map plan #650 and
 * Bjor's request of 24 Oct 2026: the planets visualised, swiped or stepped through, moving on the
 * solar map between them). Two kinds of `ui` Blender asset (ticket 683: one Blender unit is one
 * CSS px, shipped as PNG at 1x and 2x for the DOM), both under the `ui-star-map-` family of
 * ticket 758's sprites:
 *
 * - **A planet preview per look**, `ui-star-map-planet-<key>`: the hero sprite (its part is the
 *   asset id) and the orbit dot (`-dot`) the system strip sets on its orbit. The first system's
 *   planets each have a hand-authored look on their row (ticket 653), so their key is the planet's
 *   place, `1` to `planetsPerSystem`; a later system's planets wear a palette look (ticket 775),
 *   so the `solar-systems` slice names one preview per look, keyed by the look id, and a new
 *   system needs no new hand art (design principle 1).
 * - **The system strip**, `ui-star-map-system`: the backdrop (the sun and the five orbits, wide
 *   enough to pan across), the orrery frame (a nine-slice rail), the here ring and the selected
 *   marker.
 *
 * The sizes, orbit layout and motion notes are `starMapCarouselArt.json`, read by the Blender
 * author and placeholder scripts too (`docs/art/star-map-carousel/`). Pure data reads; no planet
 * state here.
 */
import CAROUSEL_ART from '../../data/design/starMapCarouselArt.json'
import { ECONOMY } from '../economy/economy'
import type { Pair } from './partsSidecar'

export const STAR_MAP_PREVIEW_ASSET_PREFIX = 'ui-star-map-planet-'
export const STAR_MAP_SYSTEM_ASSET_ID = 'ui-star-map-system'

const DOT_SUFFIX = '-dot'

/** The system strip's parts beyond the backdrop, each `ui-star-map-system-<part>`. */
export const STAR_MAP_SYSTEM_PART_SUFFIXES = ['frame', 'here', 'selected'] as const

export type StarMapSystemPartSuffix = (typeof STAR_MAP_SYSTEM_PART_SUFFIXES)[number]

export interface StarMapHeroBrief {
  sizePx: number
  discRadiusPx: number
  hazeOuterRadiusPx: number
  ringSemiAxesPx: Pair
}

export interface StarMapDotBrief {
  sizePx: number
  discRadiusPx: number
}

export interface StarMapSystemBrief {
  sizePx: Pair
  sunCentrePx: Pair
  sunRadiusPx: number
  /** One radius per place of the system, from the sun's centre, innermost first. */
  orbitRadiiPx: readonly number[]
  frame: { sizePx: number; insetPx: number }
  herePx: number
  selectedPx: number
}

/** The build ticket's motion notes (#796): the pan toward the selected planet and the swipe. */
export interface StarMapCarouselMotion {
  /** The pan across the system strip takes at most this long; a cut under reduced motion. */
  panMaxMs: number
  panEasing: string
  /** A horizontal drag this far steps the carousel. */
  swipeThresholdPx: number
  /** A drag that strays this far off its axis is the chart's scroll, not a swipe. */
  swipeMaxOffAxisPx: number
  /** A drag held longer than this is a scroll, however far it went. */
  swipeMaxMs: number
}

export const STAR_MAP_HERO: StarMapHeroBrief = {
  ...CAROUSEL_ART.hero,
  ringSemiAxesPx: pairOf(CAROUSEL_ART.hero.ringSemiAxesPx),
}
export const STAR_MAP_DOT: StarMapDotBrief = CAROUSEL_ART.dot
export const STAR_MAP_SYSTEM: StarMapSystemBrief = {
  ...CAROUSEL_ART.system,
  sizePx: pairOf(CAROUSEL_ART.system.sizePx),
  sunCentrePx: pairOf(CAROUSEL_ART.system.sunCentrePx),
}
export const STAR_MAP_CAROUSEL_MOTION: StarMapCarouselMotion = CAROUSEL_ART.motion

/** The preview of a look: `ui-star-map-planet-<key>`, the key a place or a palette look id. */
export function starMapPreviewAssetIdOf(lookKey: string): string {
  return `${STAR_MAP_PREVIEW_ASSET_PREFIX}${lookKey}`
}

/** The look key a preview asset is for, or null for another asset. */
export function lookKeyOfPreviewAsset(assetId: string): string | null {
  if (!assetId.startsWith(STAR_MAP_PREVIEW_ASSET_PREFIX)) return null
  return assetId.slice(STAR_MAP_PREVIEW_ASSET_PREFIX.length)
}

/** The hero sprite (the asset's own id) and the orbit dot of a preview asset. */
export function starMapPreviewPartIds(assetId: string): string[] {
  return [assetId, `${assetId}${DOT_SUFFIX}`]
}

export function starMapDotPartIdOf(assetId: string): string {
  return `${assetId}${DOT_SUFFIX}`
}

/** The first system's previews, one per place; each place's look is its planet row's. */
export function firstSystemPreviewAssetIds(): string[] {
  return firstSystemPlaces().map((place) => starMapPreviewAssetIdOf(String(place)))
}

/** The kernel's carousel assets: the first system's previews and the system strip. */
export function starMapCarouselKernelAssetIds(): string[] {
  return [...firstSystemPreviewAssetIds(), STAR_MAP_SYSTEM_ASSET_ID]
}

export function starMapSystemPartIds(): string[] {
  return [
    STAR_MAP_SYSTEM_ASSET_ID,
    ...STAR_MAP_SYSTEM_PART_SUFFIXES.map((suffix) => `${STAR_MAP_SYSTEM_ASSET_ID}-${suffix}`),
  ]
}

/** Every part of the kernel's carousel assets, for the part id registry. */
export function starMapCarouselKernelPartIds(): string[] {
  return [...firstSystemPreviewAssetIds().flatMap(starMapPreviewPartIds), ...starMapSystemPartIds()]
}

/** Where a planet sits on the system strip: on the middle line, its orbit's radius from the sun. */
export function orbitPositionOf(place: number, system: StarMapSystemBrief = STAR_MAP_SYSTEM): Pair {
  const radius = system.orbitRadiiPx[place - 1]
  if (radius === undefined) {
    throw new RangeError(`the system strip has no orbit for place ${place}`)
  }
  return [system.sunCentrePx[0] + radius, system.sunCentrePx[1]]
}

function firstSystemPlaces(): number[] {
  return Array.from({ length: ECONOMY.starMap.planetsPerSystem }, (_, at) => at + 1)
}

function pairOf(values: readonly number[]): Pair {
  return [values[0], values[1]]
}
