/**
 * The strip's pips (GD camera lock on #316 and Gameplay's proposal 6049828174 with its amendments,
 * ticket 341): at most 8, nearest first, each placed by its time to arrival, 0 to the window's 2 s
 * mapped along the strip, so the strip reads the same at any speed.
 *
 * What shows (Horizontal Scaler, amendment 2):
 * - from planet 1: lava, voids and caverns, collapse-warned blocks, the artefact cache, the core,
 *   and a gate the rig's tip can't open yet, by its kind alone;
 * - once `scanner_station` has its `FeatureUnlocked`: top-tier ore, in the slots hazards leave, so
 *   hazard pips never change with the unlock.
 * A pip says its kind and, for a gate, the gate's kind: never a vision row, a held item, an unbuilt
 * rig or a dynamite size. Top-tier ore is ore at or above the best tier the rig's band can hold:
 * its own band's tier plus the largest lead (`MAX_ORE_TIER_OFFSET`, band 5's ore plus 2).
 */
import { STRIP_MAX_PIPS } from '../../../constants/hazardStrip'
import { BAND_COUNT } from '../../world/planetGeometry'
import { MAX_ORE_TIER_OFFSET } from '../../world/worldCell'
import {
  isSameHit,
  NEVER_BY_TIP,
  NO_GATE,
  STRIP_KIND,
  type StepHit,
  type StripKindName,
} from './stripHits'
import type { StripSegment } from './stripScan'
import { STRIP_TIER } from './stripTiers'

export type StripPipKind = StripKindName | 'collapse'

export interface StripPip {
  kind: StripPipKind
  /** The gate's kind for a gate pip (`gatePatterns.ts`), else -1. */
  gateKind: number
  metres: number
  /** Time to arrival at the felt speed; Infinity at rest. */
  seconds: number
  /** Where on the strip, 0 at the rig to 1 at the window's end. */
  place: number
  /** Read from a lattice block or a band, so it may show a hazard that isn't quite there. */
  isCoarse: boolean
}

/** What the local player is allowed to see. */
export interface StripViewer {
  isScannerOpen: boolean
  /** The drill tip major of the last completed major, as the gates read it. */
  tipMajor: number
  /** The band the rig's nose is in. */
  rigBand: number
}

/** The look-ahead this frame: metres along the path. */
export interface StripWindow {
  /** The rig's progress along the path. */
  at: number
  reach: number
  /** The felt speed, metres a second. */
  speed: number
}

/** The largest lead an ore patch rolls above its band's tier (#140). */
const TOP_LEAD = MAX_ORE_TIER_OFFSET - (BAND_COUNT - 1)
/** Under this the rig is at rest and a pip has no arrival time. */
const RESTING_SPEED = 0.01

export function createStripPips(): StripPip[] {
  return Array.from({ length: STRIP_MAX_PIPS }, () => ({
    kind: 'lava' as StripPipKind,
    gateKind: NO_GATE,
    metres: 0,
    seconds: 0,
    place: 0,
    isCoarse: false,
  }))
}

/**
 * Writes the frame's pips into `pips`, hazards (with the collapse steps, in step order) first,
 * then ore; answers how many.
 */
export function writeStripPips(
  pips: StripPip[],
  segments: readonly StripSegment[],
  collapseSteps: readonly number[],
  window: StripWindow,
  viewer: StripViewer,
): number {
  let count = writeHazardPips(pips, segments, collapseSteps, window, viewer)
  if (viewer.isScannerOpen) count = writeOrePips(pips, count, segments, window, viewer)
  sortByDistance(pips, count)
  return count
}

function writeHazardPips(
  pips: StripPip[],
  segments: readonly StripSegment[],
  collapseSteps: readonly number[],
  window: StripWindow,
  viewer: StripViewer,
): number {
  let count = 0
  let collapseAt = firstCollapseAhead(collapseSteps, window)
  forEachHitAhead(segments, window, (hit, isCoarse) => {
    while (collapseAt < collapseSteps.length && collapseSteps[collapseAt] <= hit.step) {
      count = writePip(pips, count, 'collapse', collapseSteps[collapseAt++], window, false)
    }
    const kind = hazardKindOf(hit, viewer)
    if (kind !== null) count = writePip(pips, count, kind, hit.step, window, isCoarse, hit)
  })
  while (collapseAt < collapseSteps.length && isAhead(collapseSteps[collapseAt], window)) {
    count = writePip(pips, count, 'collapse', collapseSteps[collapseAt++], window, false)
  }
  return count
}

function writeOrePips(
  pips: StripPip[],
  written: number,
  segments: readonly StripSegment[],
  window: StripWindow,
  viewer: StripViewer,
): number {
  let count = written
  forEachHitAhead(segments, window, (hit, isCoarse) => {
    if (isTopTierOre(hit, viewer) && hazardKindOf(hit, viewer) === null)
      count = writePip(pips, count, 'ore', hit.step, window, isCoarse)
  })
  return count
}

/**
 * Each hit that starts a run ahead of the rig and within the window, nearest first; a run going on
 * from the segment before is not a new hit, and a run the rig is already in shows nothing.
 */
function forEachHitAhead(
  segments: readonly StripSegment[],
  window: StripWindow,
  visit: (hit: StepHit, isCoarse: boolean) => void,
): void {
  let before: StepHit | null = null
  for (const segment of segments) {
    for (const hit of segment.hits) {
      const isGoingOn = before !== null && hit.step === segment.from && isSameHit(before, hit)
      if (!isGoingOn && hit.kinds !== 0 && isAhead(hit.step, window))
        visit(hit, segment.tier !== STRIP_TIER.exact)
    }
    before = segment.hits[segment.hits.length - 1] ?? null
  }
}

/** The most urgent kind a hit warns of, or null when it holds no hazard the viewer may see. */
function hazardKindOf(hit: StepHit, viewer: StripViewer): StripPipKind | null {
  if ((hit.kinds & STRIP_KIND.lava) !== 0) return 'lava'
  if ((hit.kinds & STRIP_KIND.void) !== 0) return 'void'
  if ((hit.kinds & STRIP_KIND.core) !== 0) return 'core'
  if (isGateShut(hit, viewer)) return 'gate'
  return (hit.kinds & STRIP_KIND.cache) !== 0 ? 'cache' : null
}

function isGateShut(hit: StepHit, viewer: StripViewer): boolean {
  if ((hit.kinds & STRIP_KIND.gate) === 0 || hit.gateKind === NO_GATE) return false
  return hit.gateOpensAtTipMajor === NEVER_BY_TIP || viewer.tipMajor < hit.gateOpensAtTipMajor
}

function isTopTierOre(hit: StepHit, viewer: StripViewer): boolean {
  const best = viewer.rigBand - 1 + TOP_LEAD
  return (hit.kinds & STRIP_KIND.ore) !== 0 && hit.oreTierOffset >= best
}

function isAhead(step: number, window: StripWindow): boolean {
  return step > window.at && step <= window.at + window.reach
}

function firstCollapseAhead(collapseSteps: readonly number[], window: StripWindow): number {
  const first = collapseSteps.findIndex((step) => step > window.at)
  return first === -1 ? collapseSteps.length : first
}

function writePip(
  pips: StripPip[],
  count: number,
  kind: StripPipKind,
  step: number,
  window: StripWindow,
  isCoarse: boolean,
  gated?: StepHit,
): number {
  if (count >= pips.length) return count
  const pip = pips[count]
  pip.kind = kind
  pip.gateKind = kind === 'gate' && gated !== undefined ? gated.gateKind : NO_GATE
  pip.metres = step - window.at
  pip.seconds = window.speed < RESTING_SPEED ? Infinity : pip.metres / window.speed
  pip.place = Math.min(1, pip.metres / window.reach)
  pip.isCoarse = isCoarse
  return count + 1
}

/** Insertion sort of the first `count` pips by distance: at most 8, every frame, no allocation. */
function sortByDistance(pips: StripPip[], count: number): void {
  for (let at = 1; at < count; at++) {
    const pip = pips[at]
    let to = at
    while (to > 0 && pips[to - 1].metres > pip.metres) {
      pips[to] = pips[to - 1]
      to--
    }
    pips[to] = pip
  }
}
