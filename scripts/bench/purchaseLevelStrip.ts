/**
 * The hazard strip over one pass of a `bench:purchase-levels` row (ticket 840, the GVD's feel bar):
 * the sampler fed as `scene/hazardStripFrame.ts` feeds it (the nose, the felt speed, the
 * authority's collapse list, the viewer the state gives), on the planet's seeded ground with the
 * authority's world swapped in each frame.
 *
 * - **Populated:** a frame whose window has no gap and reaches as far as the sampler asked
 *   (`vCam x 2 s`, at least 16 m), or to the path's end near the centre.
 * - **The 1 s collapse warning:** on the pass's first frame the block `COLLAPSE_ACTIVE_RADIUS_MM`
 *   down the line is warned, as the authority warns a weak block that far from the body (#43); its
 *   pip must show every frame of its warning and refill until the nose is at the block, as the
 *   #560 strip row checks at 84 m/s.
 */
import { performance } from 'node:perf_hooks'
import {
  COLLAPSE_ACTIVE_RADIUS_MM,
  COLLAPSE_FILL_TICKS,
  COLLAPSE_WARN_TICKS,
} from '../../src/constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../src/constants/physics'
import { STRIP_WINDOW_SECONDS } from '../../src/constants/hazardStrip'
import type { AuthorityState } from '../../src/systems/authority/authorityState'
import type { CollapsingBlock } from '../../src/systems/authority/collapse/collapseState'
import { feltSpeedAfter, speedAlongFacing } from '../../src/systems/render/hazardStrip/feltSpeed'
import {
  createHazardStrip,
  sampleHazardStrip,
  type HazardStrip,
  type StripFrame,
} from '../../src/systems/render/hazardStrip/hazardStripSampler'
import {
  createSeededStripGround,
  type SeededStripGround,
} from '../../src/systems/render/hazardStrip/seededStripGround'
import { pathEndOf } from '../../src/systems/render/hazardStrip/stripPath'
import { gapStepsWithin } from '../../src/systems/render/hazardStrip/stripSegments'
import {
  createStripViewer,
  writeStripViewer,
} from '../../src/systems/render/hazardStrip/stripViewer'
import { emptyKindLookTable } from '../../src/systems/render/kindLookTable'
import type { Vector2 } from '../../src/systems/vehicle/localFrame'
import { blockContaining, blockIdOf } from '../../src/systems/world/collapseBlock'
import type { PlanetParams } from '../../src/systems/world/planetParams'
import type { WorldState } from '../../src/systems/world/worldState'
import { RIG_PLAYER } from './purchaseLevelRows'

/** Half a 4 m collapse block's diagonal, m: the line may meet the block this much sooner. */
const BLOCK_HALF_DIAGONAL_M = 2.83
const WARN_LEAD_M = COLLAPSE_ACTIVE_RADIUS_MM / MM_PER_METRE
const DOWN = { x: 0, y: -1 }
const FRAME_SECONDS = 1 / TICKS_PER_SECOND
const LOOKS = emptyKindLookTable()

/** The warned block of the pass and where the nose stood when it was warned. */
interface InjectedWarning {
  entry: CollapsingBlock
  noseYAtWarning: number
}

export interface StripPass {
  params: PlanetParams
  strip: HazardStrip
  ground: SeededStripGround
  frame: StripFrame
  warning: InjectedWarning | null
}

/** What the strip did in one frame. */
export interface StripFrameReading {
  stripMs: number
  isPopulated: boolean
  /** Null on a frame the warning is not judged on: settled, or the nose already at the block. */
  isWarningShown: boolean | null
}

export function createStripPass(params: PlanetParams, world: WorldState): StripPass {
  const frame: StripFrame = {
    nose: { x: 0, y: 0 },
    facing: DOWN,
    feltSpeed: 0,
    windowSeconds: STRIP_WINDOW_SECONDS,
    tick: 0,
    collapse: { blocks: [] },
    viewer: createStripViewer(),
  }
  const ground = createSeededStripGround(params, world)
  return { params, strip: createHazardStrip(), ground, frame, warning: null }
}

/** One frame: the rig's nose and velocity (m/s) after the tick the authority left in `state`. */
export function sampleStripPass(
  pass: StripPass,
  state: AuthorityState,
  nose: Vector2,
  velocity: Vector2,
): StripFrameReading {
  readStripFrame(pass, state, nose, velocity)
  const started = performance.now()
  sampleHazardStrip(pass.strip, pass.ground, pass.frame)
  const stripMs = performance.now() - started
  return { stripMs, isPopulated: isWindowPopulated(pass), isWarningShown: isWarningShown(pass) }
}

function readStripFrame(pass: StripPass, state: AuthorityState, nose: Vector2, velocity: Vector2) {
  const { frame } = pass
  pass.ground.world = state.world
  frame.nose = { x: Math.floor(nose.x) + 0.5, y: Math.floor(nose.y) + 0.5 }
  const speed = speedAlongFacing(velocity, DOWN)
  frame.feltSpeed = feltSpeedAfter(frame.feltSpeed, speed, FRAME_SECONDS)
  frame.tick = state.tick
  pass.warning ??= warningAhead(frame.nose, state.tick)
  frame.collapse = { blocks: [...state.collapse.blocks, pass.warning.entry] }
  writeStripViewer(frame.viewer, state, RIG_PLAYER, pass.params, frame.nose, LOOKS)
}

/** The block a warning radius down the line, warned now. */
function warningAhead(nose: Vector2, tick: number): InjectedWarning {
  const centreMm = { xMm: nose.x * MM_PER_METRE, yMm: (nose.y - WARN_LEAD_M) * MM_PER_METRE }
  const entry = { block: blockIdOf(blockContaining(centreMm)), startTick: tick, isForced: false }
  return { entry, noseYAtWarning: nose.y }
}

/** No gap in the window, and it reaches the sampler's reach or the path's end, whichever is nearer. */
function isWindowPopulated({ strip, params }: StripPass): boolean {
  if (strip.path === null) return false
  if (gapStepsWithin(strip.segments, strip.fromStep, strip.toStep) > 0) return false
  const wanted = strip.window.at + strip.window.reach
  return strip.toStep >= Math.floor(Math.min(wanted, pathEndOf(strip.path, params.radiusTiles)))
}

function isWarningShown(pass: StripPass): boolean | null {
  if (!isWarningJudged(pass)) return null
  const pips = pass.strip.pips.slice(0, pass.strip.pipCount)
  return pips.some((pip) => pip.kind === 'collapse')
}

/** Within the warning and its refill, and the nose not yet at the block's near corner. */
function isWarningJudged({ warning, frame }: StripPass): boolean {
  if (warning === null) return false
  const isLive = frame.tick - warning.entry.startTick < COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS
  const travelled = warning.noseYAtWarning - frame.nose.y
  return isLive && travelled < WARN_LEAD_M - 2 * BLOCK_HALF_DIAGONAL_M
}
