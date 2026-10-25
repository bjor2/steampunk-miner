/**
 * The showcase banner (D8, ticket 868; GD 04:53: the first detonation after a charge's first
 * purchase names the charge, look-only): the name the front layer showed last and the authority
 * tick it showed it at. The HUD panel reads it against the authority's clock, so it comes in, holds
 * and fades the same on a reload or a guest. Module state, presentation only.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import type { BlastVfxPlan } from '../systems/render/blastVfxPlan'

type ShownBanner = NonNullable<BlastVfxPlan['banner']>

export type BannerPhase = 'in' | 'hold' | 'fade'

export interface ShowcaseBannerModel {
  name: string
  sizeLine: string
  phase: BannerPhase
}

/** The banner comes in over its first ticks and fades over its last. */
const IN_TICKS = 15
const FADE_TICKS = 36

let shown: (ShownBanner & { fromTick: number }) | null = null

export function showShowcaseBanner(banner: ShownBanner, tick: number): void {
  shown = { ...banner, fromTick: tick }
}

export function clearShowcaseBanner(): void {
  shown = null
}

/** What the panel draws now, or null once the banner's ticks have run. */
export function readShowcaseBanner(): ShowcaseBannerModel | null {
  return bannerAt(readAuthorityState().tick)
}

export function bannerAt(tick: number): ShowcaseBannerModel | null {
  if (shown === null) return null
  const since = tick - shown.fromTick
  if (since < 0 || since >= shown.ticks) return null
  return { name: shown.name, sizeLine: shown.sizeLine, phase: phaseOf(since, shown.ticks) }
}

function phaseOf(since: number, ticks: number): BannerPhase {
  if (since < IN_TICKS) return 'in'
  return since >= ticks - FADE_TICKS ? 'fade' : 'hold'
}
