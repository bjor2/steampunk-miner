/**
 * The hazard strip's look-ahead sampler (TD scope g on #316, ticket 341): each frame it covers
 * `vCam x 2 s` (at least 16 m) of the path down the facing, sampling only what is not cached yet,
 * at the finest tier the 0.5 ms budget pays for, then spends what is left making the nearest coarse
 * stretch exact. The window is never shortened: a coarser tier covers it instead. Render only: it
 * reads the replicated world and collapse list and writes its own pips, never the authority.
 */
import {
  STRIP_FRAME_BUDGET_MS,
  STRIP_MIN_REACH_M,
  STRIP_PATH_DRIFT_M,
  STRIP_WINDOW_SECONDS,
} from '../../../constants/hazardStrip'
import type { CollapseState } from '../../authority/collapse/collapseState'
import type { Vector2 } from '../../vehicle/localFrame'
import { writeCollapseSteps } from './collapseSteps'
import type { StripGround } from './stripGround'
import {
  distanceOffPath,
  isSameHeading,
  pathEndOf,
  progressAlongPath,
  stripPathFrom,
  type StripPath,
} from './stripPath'
import {
  createStripPips,
  writeStripPips,
  type StripPip,
  type StripViewer,
  type StripWindow,
} from './stripPips'
import { createScanScratch, scanSegment, type ScanScratch, type StripSegment } from './stripScan'
import {
  coarsestTierWithin,
  dropEditedSegments,
  dropPassedSegments,
  fillGaps,
  gapStepsWithin,
  refineNearestCoarse,
  type ScanStretch,
} from './stripSegments'
import {
  exactStepsWithin,
  finestTierWithin,
  scanCostUs,
  STRIP_TIER,
  type StripTier,
} from './stripTiers'

/** What the frame hands the sampler. */
export interface StripFrame {
  /** The centre of the tile at the drill's nose, metres from the planet's centre. */
  nose: Vector2
  /** The drill's facing, a unit vector. */
  facing: Vector2
  /** Metres a second along the facing, smoothed (`feltSpeed.ts`). */
  feltSpeed: number
  /** The warning window; range Marks may lengthen it, nothing shortens it under 2 s. */
  windowSeconds: number
  tick: number
  collapse: CollapseState
  viewer: StripViewer
}

export interface HazardStrip {
  ground: StripGround | null
  path: StripPath | null
  segments: StripSegment[]
  window: StripWindow
  /** Steps `[fromStep, toStep)` of the path the window covers this frame. */
  fromStep: number
  toStep: number
  pips: StripPip[]
  pipCount: number
  /** The coarsest tier any part of the window was read at this frame. */
  tier: StripTier
  /** What this frame's scans cost by the tier model, microseconds. */
  spentUs: number
  scan: ScanStretch
  scratch: ScanScratch
  collapseSteps: number[]
  point: Vector2
}

const BUDGET_US = STRIP_FRAME_BUDGET_MS * 1000
/** Refining stops when the budget left pays for less than one lattice block of exact scan. */
const MIN_REFINE_STEPS = 8

export function createHazardStrip(): HazardStrip {
  const strip: HazardStrip = {
    ground: null,
    path: null,
    segments: [],
    window: { at: 0, reach: STRIP_MIN_REACH_M, speed: 0 },
    fromStep: 0,
    toStep: 0,
    pips: createStripPips(),
    pipCount: 0,
    tier: STRIP_TIER.exact,
    spentUs: 0,
    scan: () => ({ from: 0, to: 0, tier: STRIP_TIER.exact, hits: [], chunks: [] }),
    scratch: createScanScratch(),
    collapseSteps: [],
    point: { x: 0, y: 0 },
  }
  strip.scan = (from, to, tier) => scanStretchOf(strip, from, to, tier)
  return strip
}

export function sampleHazardStrip(strip: HazardStrip, ground: StripGround, frame: StripFrame) {
  followGround(strip, ground)
  followPath(strip, frame)
  measureWindow(strip, frame)
  forgetStaleSegments(strip)
  coverWindow(strip)
  refineWithBudgetLeft(strip)
  writeFramePips(strip, frame)
}

function followGround(strip: HazardStrip, ground: StripGround): void {
  if (strip.ground === ground) return
  strip.ground = ground
  restartPath(strip, null)
}

/** A turn, or a rig moved off the path (a teleport, a fall), starts the path again. */
function followPath(strip: HazardStrip, frame: StripFrame): void {
  if (isOnPath(strip, frame)) return
  restartPath(strip, stripPathFrom(frame.nose, frame.facing))
}

function isOnPath(strip: HazardStrip, frame: StripFrame): boolean {
  const { path } = strip
  if (path === null || !isSameHeading(path, frame.nose, frame.facing)) return false
  return distanceOffPath(path, frame.nose, strip.point) <= STRIP_PATH_DRIFT_M
}

function restartPath(strip: HazardStrip, path: StripPath | null): void {
  strip.path = path
  strip.segments.length = 0
}

/** The window: `max(speed x seconds, 16 m)` ahead of the rig, cut where the path leaves the disc. */
function measureWindow(strip: HazardStrip, frame: StripFrame): void {
  const path = strip.path as StripPath
  const seconds = Math.max(STRIP_WINDOW_SECONDS, frame.windowSeconds)
  const window = strip.window
  window.at = progressAlongPath(path, frame.nose)
  window.speed = frame.feltSpeed
  window.reach = Math.max(frame.feltSpeed * seconds, STRIP_MIN_REACH_M)
  const end = pathEndOf(path, (strip.ground as StripGround).radiusMetres)
  strip.fromStep = Math.floor(window.at)
  strip.toStep = Math.max(strip.fromStep, Math.ceil(Math.min(window.at + window.reach, end)) + 1)
  strip.spentUs = 0
}

function forgetStaleSegments(strip: HazardStrip): void {
  dropPassedSegments(strip.segments, strip.fromStep)
  dropEditedSegments(strip.segments, strip.ground as StripGround)
}

/** Every uncovered step of the window, at the finest tier the budget pays for. */
function coverWindow(strip: HazardStrip): void {
  const window = { from: strip.fromStep, to: strip.toStep }
  const gaps = gapStepsWithin(strip.segments, window.from, window.to)
  if (gaps === 0) return
  const tier = finestTierWithin(gaps, BUDGET_US)
  fillGaps(strip.segments, window, tier, strip.scan)
  strip.spentUs += scanCostUs(tier, gaps)
}

/** The nearest coarse stretches made exact, nearest first, while the budget lasts. */
function refineWithBudgetLeft(strip: HazardStrip): void {
  const window = { from: strip.fromStep, to: strip.toStep }
  let steps = exactStepsWithin(BUDGET_US - strip.spentUs)
  while (steps >= MIN_REFINE_STEPS) {
    const refined = refineNearestCoarse(strip.segments, window, steps, strip.scan)
    if (refined === 0) break
    strip.spentUs += scanCostUs(STRIP_TIER.exact, refined)
    steps = exactStepsWithin(BUDGET_US - strip.spentUs)
  }
  strip.tier = coarsestTierWithin(strip.segments, window)
}

function writeFramePips(strip: HazardStrip, frame: StripFrame): void {
  const path = strip.path as StripPath
  const { collapse, tick, viewer } = frame
  writeCollapseSteps(strip.collapseSteps, collapse, tick, path, strip.window, strip.point)
  strip.pipCount = writeStripPips(
    strip.pips,
    strip.segments,
    strip.collapseSteps,
    strip.window,
    viewer,
  )
}

function scanStretchOf(strip: HazardStrip, from: number, to: number, tier: StripTier) {
  const ground = strip.ground as StripGround
  return scanSegment(ground, strip.path as StripPath, { from, to, tier }, strip.scratch)
}
