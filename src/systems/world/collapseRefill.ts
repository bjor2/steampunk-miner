/**
 * The refill of a collapsing block (decision #43 Sequence 2 and 3, S3 default 2), integer only:
 *
 * - Over `COLLAPSE_FILL_TICKS` steps the block's carved-air samples return to density 255 from the
 *   walls inward: a sample's layer is its 8-neighbour distance from solid through the block's carved
 *   air (unreached air counts one layer past the deepest). Each step fills the outermost
 *   `ceil(layers left / steps left)` layers, worked out again from the ground as it stands, so the
 *   last step fills whatever is left and nothing but the ground and the step needs saving.
 * - Samples keep their material cell and the `yielded` bits are untouched, so re-digging never pays
 *   ore twice. The first step destroys the lining the weak test read: every lined sample in the
 *   block and every lined wall bordering its carved air, so refilled ground cannot be weak again
 *   until it is re-dug (#43 build note 3).
 * - A vehicle is never embedded: samples within `COLLAPSE_VEHICLE_CLEARANCE_MM` of a body centre are
 *   skipped at every step and stay air, a pocket the vehicle can dig out of.
 */
import { COLLAPSE_FILL_TICKS, COLLAPSE_VEHICLE_CLEARANCE_MM } from '../../constants/balance'
import { samplesOfBlock, isSampleInBlock, type CollapseBlock } from './collapseBlock'
import { eightNeighboursOf, linedWallsOfBlock, type SamplePoint } from './collapseWeakness'
import {
  casingGradeOf,
  closeSession,
  editSample,
  markSampleCasing,
  openSession,
  type EditSession,
  type GroundEdit,
} from './groundEditSession'
import type { PlanetParams } from './planetParams'
import { MM_PER_SAMPLE, SOLID_DENSITY } from './sampleGrid'
import { isCarvedAirAt, isSolidAt, openSampleLayers, type SampleLayers } from './sampleLayers'
import { FULL_WEIGHT, type WeightedSample } from './stampShape'
import type { WorldState } from './worldState'

/** A vehicle's body centre in mm. */
export interface BodyCentre {
  xMm: number
  yMm: number
}

export interface RefillStep extends GroundEdit {
  /** Carved-air samples returned to solid by this step. */
  filled: number
}

/** What a refill is about to do when it starts: what it will fill and whom it catches. */
export interface RefillPlan {
  samples: number
  /** For each body centre given, whether its clearance circle reaches the block's carved air. */
  caught: boolean[]
}

export function planRefill(
  world: WorldState,
  params: PlanetParams,
  block: CollapseBlock,
  bodies: readonly BodyCentre[],
): RefillPlan {
  const air = carvedAirOfBlock(openSampleLayers(world, params), block)
  return {
    samples: air.filter((sample) => !isNearAnyBody(sample, bodies)).length,
    caught: bodies.map((body) => air.some((sample) => isNearBody(sample, body))),
  }
}

/** Step `step` (0 to `COLLAPSE_FILL_TICKS - 1`) of the block's refill. */
export function refillBlockStep(
  world: WorldState,
  params: PlanetParams,
  block: CollapseBlock,
  step: number,
  bodies: readonly BodyCentre[],
): RefillStep {
  const layers = openSampleLayers(world, params)
  const due = samplesDueAt(layers, block, step).filter((sample) => !isNearAnyBody(sample, bodies))
  const session = openSession(world, params)
  if (step === 0) destroyLining(session, layers, block)
  due.forEach((sample) => fillSample(session, sample))
  return { ...closeSession(session), filled: due.length }
}

/** The carved air in the outermost `ceil(layers left / steps left)` layers. */
function samplesDueAt(layers: SampleLayers, block: CollapseBlock, step: number): SamplePoint[] {
  const depths = layerDepthsOf(layers, block)
  const deepest = Math.max(0, ...depths.values())
  const stepsLeft = Math.max(1, COLLAPSE_FILL_TICKS - step)
  const reach = Math.ceil(deepest / stepsLeft)
  return [...depths.entries()].filter(([, depth]) => depth <= reach).map(([key]) => sampleOf(key))
}

/**
 * Each carved-air sample's 8-neighbour distance from solid, walking only the block's carved air;
 * air the walk never reaches counts one layer past the deepest.
 */
function layerDepthsOf(layers: SampleLayers, block: CollapseBlock): Map<string, number> {
  const air = carvedAirOfBlock(layers, block)
  const depths = new Map<string, number>()
  let front = air.filter((sample) => isBesideSolid(layers, sample))
  for (let depth = 1; front.length > 0; depth++) {
    front.forEach((sample) => depths.set(keyOf(sample), depth))
    front = nextFront(layers, block, front, depths)
  }
  const unreached = 1 + Math.max(0, ...depths.values())
  air.filter((sample) => !depths.has(keyOf(sample))).forEach((s) => depths.set(keyOf(s), unreached))
  return depths
}

function isBesideSolid(layers: SampleLayers, sample: SamplePoint): boolean {
  return eightNeighboursOf(sample).some((n) => isSolidAt(layers, n.sx, n.sy))
}

function nextFront(
  layers: SampleLayers,
  block: CollapseBlock,
  front: readonly SamplePoint[],
  depths: ReadonlyMap<string, number>,
): SamplePoint[] {
  const next = new Map<string, SamplePoint>()
  for (const sample of front.flatMap(eightNeighboursOf)) {
    const key = keyOf(sample)
    if (depths.has(key) || next.has(key) || !isBlockAir(layers, block, sample)) continue
    next.set(key, sample)
  }
  return [...next.values()]
}

function isBlockAir(layers: SampleLayers, block: CollapseBlock, sample: SamplePoint): boolean {
  return isSampleInBlock(block, sample.sx, sample.sy) && isCarvedAirAt(layers, sample.sx, sample.sy)
}

function carvedAirOfBlock(layers: SampleLayers, block: CollapseBlock): SamplePoint[] {
  return samplesOfBlock(block).filter((sample) => isCarvedAirAt(layers, sample.sx, sample.sy))
}

/** Lining in the block and on the walls round its carved air goes with the collapse. */
function destroyLining(session: EditSession, layers: SampleLayers, block: CollapseBlock): void {
  ;[...samplesOfBlock(block), ...linedWallsOfBlock(layers, block)]
    .map(weightedOf)
    .filter((sample) => casingGradeOf(session, sample) > 0)
    .forEach((sample) => markSampleCasing(session, sample, 0))
}

function fillSample(session: EditSession, sample: SamplePoint): void {
  const weighted = weightedOf(sample)
  editSample(session, weighted, () => SOLID_DENSITY)
  if (casingGradeOf(session, weighted) > 0) markSampleCasing(session, weighted, 0)
}

function isNearAnyBody(sample: SamplePoint, bodies: readonly BodyCentre[]): boolean {
  return bodies.some((body) => isNearBody(sample, body))
}

function isNearBody(sample: SamplePoint, body: BodyCentre): boolean {
  const dx = sample.sx * MM_PER_SAMPLE - body.xMm
  const dy = sample.sy * MM_PER_SAMPLE - body.yMm
  return dx * dx + dy * dy <= COLLAPSE_VEHICLE_CLEARANCE_MM * COLLAPSE_VEHICLE_CLEARANCE_MM
}

function weightedOf(sample: SamplePoint): WeightedSample {
  return { sx: sample.sx, sy: sample.sy, weight: FULL_WEIGHT, floor: 0 }
}

function keyOf(sample: SamplePoint): string {
  return `${sample.sx},${sample.sy}`
}

function sampleOf(key: string): SamplePoint {
  const [sx, sy] = key.split(',').map((part) => Number.parseInt(part, 10))
  return { sx, sy }
}
