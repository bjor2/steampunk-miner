/**
 * What the hazard strip can find on its line (TD scope g on #316, ticket 341): a fixed set of
 * kinds, one bit each, so a chunk or lattice block sums up as one small number (scope g 3, "a byte
 * per chunk"). A hit carries its kinds, a gate's kind and opening major and an ore's tier offset,
 * and nothing else: no field can name a vision row, a held item, a rig or a dynamite size (the
 * Horizontal Scaler's guard on the strip).
 */

export const STRIP_KIND = {
  lava: 1,
  /** A cave or open pocket the rig would fall into; never a tunnel it dug. */
  void: 2,
  core: 4,
  cache: 8,
  ore: 16,
  /** An ore cell whose gate a slice draws (`cellGateLook`); its kind rides beside it. */
  gate: 32,
} as const

export type StripKindName = keyof typeof STRIP_KIND

/** The kinds that warn from planet 1 on, whatever is unlocked (GD lock: "hazard, cache and core"). */
export const HAZARD_KINDS = STRIP_KIND.lava | STRIP_KIND.void | STRIP_KIND.core | STRIP_KIND.cache

/** No gate on the hit. */
export const NO_GATE = -1

/** A gate no drill tip opens (extractor and dynamite gates). */
export const NEVER_BY_TIP = -1

/** What one tile, or one step of the 3-cell line, holds. */
export interface StripHit {
  kinds: number
  gateKind: number
  gateOpensAtTipMajor: number
  /** The highest ore tier offset on the step, -1 with no ore. */
  oreTierOffset: number
}

/** A hit at a step of the path, the first of a run of equal steps. */
export interface StepHit extends StripHit {
  step: number
}

export function createStripHit(): StripHit {
  return { kinds: 0, gateKind: NO_GATE, gateOpensAtTipMajor: NEVER_BY_TIP, oreTierOffset: -1 }
}

export function clearStripHit(hit: StripHit): void {
  hit.kinds = 0
  hit.gateKind = NO_GATE
  hit.gateOpensAtTipMajor = NEVER_BY_TIP
  hit.oreTierOffset = -1
}

/** Adds a tile's hit to a step's: kinds join, the first gate stays, the best ore wins. */
export function joinStripHit(into: StripHit, tile: StripHit): void {
  into.kinds |= tile.kinds
  if (into.gateKind === NO_GATE && tile.gateKind !== NO_GATE) {
    into.gateKind = tile.gateKind
    into.gateOpensAtTipMajor = tile.gateOpensAtTipMajor
  }
  into.oreTierOffset = Math.max(into.oreTierOffset, tile.oreTierOffset)
}

export function isSameHit(a: StripHit, b: StripHit): boolean {
  return (
    a.kinds === b.kinds &&
    a.gateKind === b.gateKind &&
    a.gateOpensAtTipMajor === b.gateOpensAtTipMajor &&
    a.oreTierOffset === b.oreTierOffset
  )
}

export function stepHitOf(step: number, hit: StripHit): StepHit {
  return { step, ...hit }
}
